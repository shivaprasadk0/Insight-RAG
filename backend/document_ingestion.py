# %%
"""
Suzlon Ingestion Pipeline (Page-Wise):
PDF → Document Intelligence (Pages) → Page-Wise Chunking → Embeddings → Azure AI Search

Chunking Strategy:
- 1 page = 1 chunk by default
- If a TEXT block exceeds 8k tokens → recursively halve until each piece is under 8k → apply 100-token overlap
- TABLES are kept structurally intact:
    - If a table exceeds 8k tokens → split row-wise, repeating header + separator in every chunk
    - Row overlap of 2 rows between consecutive table chunks
- Overlap is within the same block type, within the same page only
"""

import os
import re
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Tuple
from datetime import datetime, timezone
import hashlib

import tiktoken

# Azure SDK
from azure.core.credentials import AzureKeyCredential
from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import AnalyzeDocumentRequest
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SimpleField,
    SearchField,
    SearchableField,
    VectorSearch,
    HnswAlgorithmConfiguration,
    SearchFieldDataType,
    VectorSearchProfile
)
from openai import AzureOpenAI

# PDF Processing
import fitz  # PyMuPDF

# LangChain
from langchain_core.documents import Document

# Progress tracking
from tqdm import tqdm

from dotenv import load_dotenv
load_dotenv(".env", override=True)

# %%
# CONFIGURATION
CONFIG = {
    "pdf_path": "Stakeholder_Engagement_Policy.pdf",

    # Azure Document Intelligence
    "doc_intel_endpoint": os.getenv("AZURE_DOC_INTEL_ENDPOINT"),
    "doc_intel_key": os.getenv("AZURE_DOC_INTEL_KEY"),

    # Azure OpenAI Embedding
    "embedding_endpoint": os.getenv("AZURE_EMBEDDING_ENDPOINT"),
    "embedding_model": os.getenv("AZURE_EMBEDDING_MODEL_NAME"),
    "embedding_deployment": os.getenv("AZURE_EMBEDDING_DEPLOYMENT_NAME"),
    "embedding_api_version": os.getenv("AZURE_EMBEDDING_API_VERSION"),
    "embedding_key": os.getenv("AZURE_EMBEDDING_KEY"),

    # Azure AI Search
    "search_endpoint": os.getenv("AZURE_SEARCH_ENDPOINT"),
    "search_key": os.getenv("AZURE_SEARCH_KEY"),
    "search_index_name": "suzlon-policy-index-2",

    # Token Limits
    "max_tokens": 8000,           # Hard limit per chunk before splitting
    "text_overlap_tokens": 100,   # Overlap between consecutive text chunks (same page)
    "table_row_overlap": 2,       # Number of rows to repeat between consecutive table chunks

    # Embedding
    "batch_size": 100,

    # tiktoken encoding — cl100k_base is used by text-embedding-3-large
    "tiktoken_encoding": "cl100k_base",
}

# %%
# INITIALIZE CLIENTS
doc_intel_client = DocumentIntelligenceClient(
    endpoint=CONFIG["doc_intel_endpoint"],
    credential=AzureKeyCredential(CONFIG["doc_intel_key"])
)

azure_embedding_client = AzureOpenAI(
    api_version=CONFIG["embedding_api_version"],
    azure_endpoint=CONFIG["embedding_endpoint"],
    api_key=CONFIG["embedding_key"]
)

search_index_client = SearchIndexClient(
    CONFIG["search_endpoint"],
    AzureKeyCredential(CONFIG["search_key"])
)

# Global tokenizer — initialised once
TOKENIZER = tiktoken.get_encoding(CONFIG["tiktoken_encoding"])


# %%
# TOKEN UTILS
def count_tokens(text: str) -> int:
    """Count tokens using tiktoken."""
    return len(TOKENIZER.encode(text))


def tokens_to_text(tokens: List[int]) -> str:
    """Decode a list of token ids back to text."""
    return TOKENIZER.decode(tokens)


# %%
# INDEX CREATION
def create_search_index():
    """Create or update Azure AI Search index."""
    fields = [
        SimpleField(name="id", type="Edm.String", key=True),
        SimpleField(name="parent_doc_id", type="Edm.String", filterable=True),
        SimpleField(name="pdf_name", type="Edm.String", filterable=True),
        SimpleField(name="content_type", type="Edm.String", filterable=True),
        SimpleField(name="chunk_type", type="Edm.String", filterable=True),
        SearchableField(name="content", type="Edm.String"),
        SimpleField(name="page_number", type="Edm.Int32", filterable=True),
        SimpleField(name="page_image_url", type="Edm.String"),
        SimpleField(name="chunk_id", type="Edm.Int32", filterable=True),
        SimpleField(name="chunk_index", type="Edm.Int32", filterable=True),
        SimpleField(name="created_at", type="Edm.DateTimeOffset", filterable=True),
        SimpleField(name="processed_at", type="Edm.DateTimeOffset", filterable=True),
        SearchField(
            name="embedding",
            type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
            vector_search_dimensions=3072,
            vector_search_profile_name="vector-profile"
        )
    ]
    vector_search = VectorSearch(
        algorithms=[HnswAlgorithmConfiguration(name="hnsw")],
        profiles=[VectorSearchProfile(name="vector-profile", algorithm_configuration_name="hnsw")]
    )
    index = SearchIndex(name=CONFIG["search_index_name"], fields=fields, vector_search=vector_search)
    search_index_client.create_or_update_index(index)
    print(f"✓ Index '{CONFIG['search_index_name']}' ready")


# %%
# 1. EXTRACTION & PAGE MAPPING
def extract_pdf_by_pages(pdf_path: str) -> List[Dict[str, Any]]:
    """Extract PDF content preserving correct page structure via Document Intelligence."""
    print(f"\n{'=' * 80}")
    print("STEP 1: PDF EXTRACTION (Document Intelligence)")
    print(f"{'=' * 80}")

    with open(pdf_path, "rb") as f:
        poller = doc_intel_client.begin_analyze_document(
            model_id="prebuilt-layout",
            body=AnalyzeDocumentRequest(bytes_source=f.read()),
            output_content_format="markdown"
        )

    result = poller.result()
    pages_content = []

    for page in result.pages:
        page_num = page.page_number
        page_text_parts = []

        if page.spans:
            for span in page.spans:
                text_segment = result.content[span.offset: span.offset + span.length]
                page_text_parts.append(text_segment)

        full_page_text = "".join(page_text_parts)
        pages_content.append({
            "page_number": page_num,
            "content": full_page_text
        })

    print(f"✓ Extracted {len(pages_content)} pages")
    return pages_content


# %%
# 2. PAGE URL MAP (NO STORAGE DEPENDENCY)
def process_pages(pdf_path: str) -> Dict[str, Any]:
    """Create page mapping without uploading files to external storage."""
    print(f"\n{'=' * 80}")
    print("STEP 2: BUILD PAGE MAP")
    print(f"{'=' * 80}")

    pdf_stem = Path(pdf_path).stem
    doc = fitz.open(pdf_path)

    # No blob/adls upload: keep URL field empty so schema stays compatible.
    page_urls = {page_num + 1: "" for page_num in range(len(doc))}

    doc.close()

    return {"page_urls": page_urls, "pdf_name": pdf_stem}


# %%
# 3. CHUNKING UTILS

# ---------------------------------------------------------------------------
# 3a. Markdown table / text separator  (kept from original)
# ---------------------------------------------------------------------------
def separate_markdown_tables(text: str) -> List[Dict[str, str]]:
    """
    Walk through lines and separate the page content into ordered blocks of
    type 'text' or 'table'.  A table block is a contiguous run of lines that
    start with '|'.
    """
    lines = text.splitlines()
    blocks: List[Dict[str, str]] = []
    current_text: List[str] = []
    current_table: List[str] = []
    in_table = False

    for line in lines:
        stripped = line.strip()
        is_table_row = stripped.startswith("|")

        if is_table_row:
            if not in_table:
                # Flush accumulated text block
                if current_text:
                    blocks.append({"type": "text", "content": "\n".join(current_text)})
                    current_text = []
                in_table = True
            current_table.append(line)
        else:
            if in_table:
                # Table just ended — flush it
                blocks.append({"type": "table", "content": "\n".join(current_table)})
                current_table = []
                in_table = False
            current_text.append(line)

    # Flush whatever is left
    if in_table and current_table:
        blocks.append({"type": "table", "content": "\n".join(current_table)})
    if current_text:
        blocks.append({"type": "text", "content": "\n".join(current_text)})

    return blocks


# ---------------------------------------------------------------------------
# 3b. Table header detection
# ---------------------------------------------------------------------------
def extract_table_header(rows: List[str]) -> Tuple[List[str], List[str]]:
    """
    Given the raw rows of a markdown table, return (header_rows, data_rows).

    header_rows  – the column-name row + the separator row (e.g. |---|---|)
    data_rows    – everything after the separator

    If no separator is found we treat the first row as the header and the
    rest as data (best-effort).
    """
    separator_index = None
    for i, row in enumerate(rows):
        # A separator row contains only |, -, :, and spaces
        stripped = row.strip()
        if stripped.startswith("|") and re.match(r'^[\|\-\:\s]+$', stripped):
            separator_index = i
            break

    if separator_index is not None:
        # Header = everything up to and including the separator
        header_rows = rows[: separator_index + 1]
        data_rows = rows[separator_index + 1:]
    else:
        # Fallback: first row is header, rest is data
        header_rows = rows[:1]
        data_rows = rows[1:]

    return header_rows, data_rows


# ---------------------------------------------------------------------------
# 3c. Row-wise table splitter
# ---------------------------------------------------------------------------
def split_table_by_rows(table_text: str) -> List[str]:
    """
    If the table fits in max_tokens → return as-is (single chunk).
    Otherwise split into row-wise chunks, each with:
        - The header rows prepended
        - A row-overlap of CONFIG['table_row_overlap'] rows with the previous chunk
    Every resulting chunk is guaranteed ≤ max_tokens (unless a single row
    itself exceeds the limit, which is practically impossible).
    """
    max_tokens = CONFIG["max_tokens"]
    row_overlap = CONFIG["table_row_overlap"]

    # Fast path — table already fits
    if count_tokens(table_text) <= max_tokens:
        return [table_text]

    rows = table_text.splitlines()
    header_rows, data_rows = extract_table_header(rows)
    header_text = "\n".join(header_rows)
    header_token_count = count_tokens(header_text)

    chunks: List[str] = []
    current_data_rows: List[str] = []
    current_token_count = header_token_count  # every chunk starts with the header

    for row in data_rows:
        row_tokens = count_tokens(row)

        # Would adding this row bust the limit?
        # +1 accounts for the newline joining
        if current_token_count + row_tokens + 1 > max_tokens and current_data_rows:
            # Flush current chunk
            chunk_text = header_text + "\n" + "\n".join(current_data_rows)
            chunks.append(chunk_text)

            # Carry over the last `row_overlap` rows for context continuity
            overlap_rows = current_data_rows[-row_overlap:] if row_overlap > 0 else []
            current_data_rows = overlap_rows
            current_token_count = header_token_count + sum(
                count_tokens(r) + 1 for r in overlap_rows
            )

        current_data_rows.append(row)
        current_token_count += row_tokens + 1  # +1 for newline

    # Flush the last chunk
    if current_data_rows:
        chunk_text = header_text + "\n" + "\n".join(current_data_rows)
        chunks.append(chunk_text)

    return chunks


# ---------------------------------------------------------------------------
# 3d. Recursive halving for text blocks
# ---------------------------------------------------------------------------
def recursive_halve_text(text: str) -> List[str]:
    """
    If text fits within max_tokens → return as single chunk.
    Otherwise split the token list exactly in half, decode each half back to
    text, and recurse.  This guarantees every leaf chunk is ≤ max_tokens.
    """
    max_tokens = CONFIG["max_tokens"]
    tokens = TOKENIZER.encode(text)

    if len(tokens) <= max_tokens:
        return [text]

    mid = len(tokens) // 2
    left_text = TOKENIZER.decode(tokens[:mid])
    right_text = TOKENIZER.decode(tokens[mid:])

    # Recurse on both halves
    return recursive_halve_text(left_text) + recursive_halve_text(right_text)


def apply_text_overlap(chunks: List[str]) -> List[str]:
    """
    Given an ordered list of text chunks (from the same page), insert a
    100-token overlap: the END of chunk[i] is prepended to chunk[i+1].

    Returns a new list of the same length with overlaps applied.
    """
    overlap_tokens = CONFIG["text_overlap_tokens"]

    if len(chunks) <= 1:
        return chunks

    result = [chunks[0]]  # first chunk stays as-is

    for i in range(1, len(chunks)):
        prev_tokens = TOKENIZER.encode(chunks[i - 1])
        # Take the last `overlap_tokens` tokens from previous chunk
        overlap_token_ids = prev_tokens[-overlap_tokens:] if len(prev_tokens) >= overlap_tokens else prev_tokens
        overlap_text = TOKENIZER.decode(overlap_token_ids)

        # Prepend overlap to current chunk
        result.append(overlap_text + "\n" + chunks[i])

    return result


# ---------------------------------------------------------------------------
# 3e. Master chunking orchestrator
# ---------------------------------------------------------------------------
def chunk_pages(pages_content: List[Dict], pdf_name: str, page_urls: Dict[int, str]) -> List[Document]:
    """
    For every page:
        1. Separate into text and table blocks (order preserved)
        2. Tables  → split row-wise if > 8k tokens, else keep whole
        3. Text    → recursive halve if > 8k tokens, then apply 100-token overlap
        4. Overlap is per-block-type, per-page only
    """
    print(f"\n{'=' * 80}")
    print("STEP 3: PAGE-WISE CHUNKING")
    print(f"{'=' * 80}")

    documents: List[Document] = []
    chunk_id = 0
    parent_doc_id = hashlib.md5(pdf_name.encode()).hexdigest()[:12]

    for page in tqdm(pages_content, desc="Chunking Pages"):
        page_num = page["page_number"]
        page_text = page["content"]
        page_url = page_urls.get(page_num, "")

        # --- fast path: entire page fits in one chunk ---
        if count_tokens(page_text.strip()) <= CONFIG["max_tokens"]:
            if not page_text.strip():
                continue
            chunk_id += 1
            documents.append(Document(
                page_content=page_text.strip(),
                metadata={
                    "chunk_id": chunk_id,
                    "parent_doc_id": parent_doc_id,
                    "pdf_name": pdf_name,
                    "content_type": "page",
                    "chunk_type": "page",
                    "chunk_index": 0,
                    "page_number": page_num,
                    "page_image_url": page_url,
                }
            ))
            continue

        # --- page exceeds 8k tokens → split into blocks ---
        blocks = separate_markdown_tables(page_text)

        # Collect text chunks and table chunks separately so we can apply
        # overlap only within the same type.  We also track insertion order
        # so that the final document list stays page-ordered.
        # Each entry: (block_type, list_of_chunk_strings)
        typed_block_chunks: List[Tuple[str, List[str]]] = []

        for block in blocks:
            content = block["content"].strip()
            if not content:
                continue

            if block["type"] == "table":
                table_chunks = split_table_by_rows(content)
                typed_block_chunks.append(("table", table_chunks))
            else:
                # Recursive halve → then overlap across consecutive text chunks
                halved = recursive_halve_text(content)
                overlapped = apply_text_overlap(halved)
                typed_block_chunks.append(("text", overlapped))

        # Now flatten into Documents, preserving order
        # We track a running chunk_index *per type* on this page for metadata
        text_index_on_page = 0
        table_index_on_page = 0

        for block_type, chunk_list in typed_block_chunks:
            for chunk_text in chunk_list:
                if not chunk_text.strip():
                    continue

                chunk_id += 1

                if block_type == "table":
                    idx = table_index_on_page
                    table_index_on_page += 1
                else:
                    idx = text_index_on_page
                    text_index_on_page += 1

                documents.append(Document(
                    page_content=chunk_text.strip(),
                    metadata={
                        "chunk_id": chunk_id,
                        "parent_doc_id": parent_doc_id,
                        "pdf_name": pdf_name,
                        "content_type": block_type,
                        "chunk_type": block_type,
                        "chunk_index": idx,
                        "page_number": page_num,
                        "page_image_url": page_url,
                    }
                ))

    print(f"✓ Created {len(documents)} chunks")
    return documents


# %%
# 4. EMBED
def embed_documents(documents: List[Document]) -> List[Document]:
    """Batch-embed all documents using Azure OpenAI embeddings."""
    print(f"\n{'=' * 80}")
    print("STEP 4: EMBEDDING")
    print(f"{'=' * 80}")

    batch_size = CONFIG["batch_size"]
    texts = [doc.page_content for doc in documents]

    for i in tqdm(range(0, len(texts), batch_size), desc="Embedding"):
        batch = texts[i: i + batch_size]
        try:
            resp = azure_embedding_client.embeddings.create(
                input=batch,
                model=CONFIG["embedding_deployment"]
            )
            for idx, item in enumerate(resp.data):
                documents[i + idx].metadata["embedding"] = item.embedding
        except Exception as e:
            print(f"⚠ Error embedding batch starting at {i}: {e}")

    return documents


# %%
# 5. UPLOAD TO SEARCH INDEX
def upload_to_search_index(documents: List[Document]):
    """Upload embedded documents to Azure AI Search in batches."""
    print(f"\n{'=' * 80}")
    print("STEP 5: UPLOAD TO SEARCH")
    print(f"{'=' * 80}")

    valid_docs = [d for d in documents if d.metadata.get("embedding")]
    if not valid_docs:
        print("⚠ No valid documents with embeddings to upload.")
        return

    now_iso = datetime.now(timezone.utc).isoformat()

    upload_batch = []
    for doc in valid_docs:
        search_doc = {
            "id": f"{doc.metadata['parent_doc_id']}_{doc.metadata['chunk_id']}",
            "parent_doc_id": doc.metadata["parent_doc_id"],
            "pdf_name": doc.metadata["pdf_name"],
            "content_type": doc.metadata.get("content_type", "text"),
            "chunk_type": doc.metadata.get("chunk_type", "text"),
            "content": doc.page_content,
            "page_number": doc.metadata.get("page_number"),
            "page_image_url": doc.metadata.get("page_image_url", ""),
            "chunk_id": doc.metadata["chunk_id"],
            "chunk_index": doc.metadata.get("chunk_index", 0),
            "embedding": doc.metadata["embedding"],
            "created_at": now_iso,
            "processed_at": now_iso,
        }
        upload_batch.append(search_doc)

    batch_size = 100
    client = SearchClient(
        CONFIG["search_endpoint"],
        CONFIG["search_index_name"],
        AzureKeyCredential(CONFIG["search_key"])
    )

    for i in tqdm(range(0, len(upload_batch), batch_size), desc="Uploading"):
        try:
            client.upload_documents(documents=upload_batch[i: i + batch_size])
        except Exception as e:
            print(f"⚠ Upload error at batch {i}: {e}")

    print(f"✓ Uploaded {len(upload_batch)} documents")


# %%
# MAIN PIPELINE
async def run_pipeline(pdf_path: str):
    """End-to-end pipeline for a single PDF."""
    try:
        print(f"\n{'#' * 80}")
        print(f"  Processing: {pdf_path}")
        print(f"{'#' * 80}")

        # 1. Extract page-wise content via Document Intelligence
        pages_content = extract_pdf_by_pages(pdf_path)

        # 2. Build page map without any external storage upload
        blob_info = process_pages(pdf_path)

        # 3. Page-wise chunking (halve text / row-split tables)
        documents = chunk_pages(pages_content, blob_info["pdf_name"], blob_info["page_urls"])

        # 4. Embed
        documents = embed_documents(documents)

        # 5. Upload to Azure AI Search
        upload_to_search_index(documents)

        print(f"\n✓ Pipeline complete for: {pdf_path}\n")

    except Exception as e:
        print(f"✗ Error processing {pdf_path}: {e}")
        raise


# %%
# ENTRY POINT
if __name__ == "__main__":
    # Create / update the search index once at startup
    create_search_index()

    docs_dir = "downloaded_documents"
    if os.path.exists(docs_dir):
        pdf_files = [f for f in os.listdir(docs_dir) if f.casefold().endswith(".pdf")]
        if not pdf_files:
            print(f"⚠ No PDF files found in '{docs_dir}'")
        else:
            for f in pdf_files:
                # run_pipeline is async but contains no real awaits;
                # use asyncio.run() to drive it properly.
                asyncio.run(run_pipeline(os.path.join(docs_dir, f)))
    else:
        print(f"⚠ Directory '{docs_dir}' not found")
