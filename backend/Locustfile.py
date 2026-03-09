import random
import csv
import os
from datetime import datetime
from locust import HttpUser, task, between

esg_questions = [
    "What does ESG stand for, and how does it relate to our organization's sustainability goals?",
    "How is sustainability different from ESG?",
    "What are the key ESG focus areas for our organization?",
    "What initiatives has the organization undertaken to achieve sustainability excellence?",
    "How do we measure performance against sustainability targets?",
    "What certifications or recognitions support our excellence in sustainability?",
    "How does the organization ensure that products are environmentally responsible throughout their lifecycle?",
    "What are the policies for circular economy or product recycling?",
    "How do we evaluate product impact on end users and environment?",
    "What are our supplier sustainability criteria?",
    "How does the company monitor ESG compliance among suppliers?",
    "Are there any responsible sourcing or green procurement policies in place?",
    "What is the governance framework for ESG management?",
    "Which committees oversee ESG and sustainability functions?",
    "How are ESG responsibilities distributed across the organization?",
    "What are the key sustainability policies in our organization?",
    "How often are these policies reviewed and updated?",
    "How do these policies align with national and global standards (like UN SDGs)?",
    "What is the overall approach towards achieving long-term sustainability?",
    "Can you share the roadmap or milestones for 2025/2030 targets?",
    "How are progress and results monitored?",
    "What are the major ESG metrics tracked by the organization?",
    "How are these metrics reported and validated?",
    "What tools or platforms are used for ESG data management?",
    "What initiatives are in place to reduce the organization's environmental footprint?",
    "How do we manage energy, waste, and emissions reduction programs?",
    "What is our renewable energy adoption target?",
    "What are the key social responsibility initiatives?",
    "How does the organization promote an ethical workplace culture?",
    "Are there mechanisms for whistleblowing and grievance redressal?",
    "What major sustainability awards or recognitions has the organization received?",
    "Which teams or projects were recognized recently?",
    "What is the purpose of the Sustainability Report and BRSR (Business Responsibility and Sustainability Report)?",
    "How frequently are reports published and who approves them?",
    "Where can employees access past reports?",
    "How does the company track and reduce greenhouse gas (GHG) emissions?",
    "What steps are being taken for water conservation and reuse?",
    "How do we manage waste responsibly?",
    "Are there biodiversity preservation projects ongoing?",
    "What sustainability trainings are available for employees?",
    "How can employees contribute to sustainability programs?",
    "What internal campaigns promote ESG awareness?",
    "Who are the key sustainability champions or achievers in our organization?",
    "How are sustainability efforts recognized internally?",
    "What are the latest ESG-related news or updates within the organization?",
    "How can I find recent posts or campaigns on social media related to sustainability?",
    "How do sustainability goals align with business strategy?",
    "Which departments play a key role in driving ESG initiatives?",
]



# CSV setup — created once at module load
CSV_FILE = f"esg_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
CSV_HEADERS = ["request_num", "timestamp", "question", "status_code", "response_text", "response_time_ms", "success"]

with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
    writer.writeheader()


def append_to_csv(row: dict):
    """Thread-safe append to CSV (csv module's writer is not thread-safe, use a lock if needed)."""
    with open(CSV_FILE, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        writer.writerow(row)


class ESGQueryUser(HttpUser):
    """
    Locust user class for simulating ESG API queries.

    Usage:
        locust -f locustfile.py --host=http://localhost:8000

    Features:
    - Randomly selects questions from the ESG questions list
    - Prints response text after every request
    - Saves question, response, status, and timing to a timestamped CSV
    - Stops after 30 total requests across all users
    """

    wait_time = between(1, 3)

    total_requests = 0
    max_requests = 30

    @task
    def make_random_esg_query(self):
        """Make a random ESG query to the API."""
        if ESGQueryUser.total_requests >= ESGQueryUser.max_requests:
            self.environment.runner.quit()
            return

        question = random.choice(esg_questions)
        payload = {
            "history": [],
            "query": question,
            "user_id": "user_002",
            "chat_id": "chat_002",
        }

        with self.client.post(
            "/make_query",
            json=payload,
            catch_response=True,
        ) as response:
            ESGQueryUser.total_requests += 1
            req_num = ESGQueryUser.total_requests
            timestamp = datetime.now().isoformat()
            response_time_ms = response.elapsed.total_seconds() * 1000

            # --- Extract response text ---
            try:
                resp_json = response.json()
                # Adjust the key below to match your actual API response shape
                response_text = resp_json.get("answer") or resp_json.get("response") or str(resp_json)
            except Exception:
                response_text = response.text  # fallback to raw text

            # --- Console output ---
            print(f"\n{'='*60}")
            print(f"Request #{req_num} / {ESGQueryUser.max_requests}")
            print(f"Timestamp  : {timestamp}")
            print(f"Status     : {response.status_code}")
            print(f"Time (ms)  : {response_time_ms:.1f}")
            print(f"Question   : {question}")
            print(f"Response   : {response_text}")
            print(f"{'='*60}\n")

            # --- Mark success/failure ---
            if response.status_code == 200:
                response.success()
                success = True
            else:
                response.failure(f"Status code: {response.status_code}")
                success = False

            # --- Save to CSV ---
            append_to_csv({
                "request_num": req_num,
                "timestamp": timestamp,
                "question": question,
                "status_code": response.status_code,
                "response_text": response_text,
                "response_time_ms": round(response_time_ms, 1),
                "success": success,
            })

            # Stop once limit is hit
            if req_num >= ESGQueryUser.max_requests:
                self.environment.runner.quit()