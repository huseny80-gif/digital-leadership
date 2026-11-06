from flask import Flask, jsonify, request
from flask_cors import CORS
import json, os
from pathlib import Path

app = Flask(__name__)
CORS(app)

OFFICE_DIR = Path(os.getenv("OFFICE_DIR", Path.home() / "virtual-office"))
STATE_FILE = OFFICE_DIR / "state" / "office_state.json"
EMPLOYEES_FILE = OFFICE_DIR / "config" / "employees.json"

def read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route("/api/state", methods=["GET"])
def get_state():
    return jsonify(read_json(STATE_FILE))

@app.route("/api/state/<emp_id>", methods=["POST"])
def update_state(emp_id):
    state = read_json(STATE_FILE)
    if emp_id not in state:
        return jsonify({"error": "employee not found"}), 404
    updates = request.get_json()
    state[emp_id].update(updates)
    write_json(STATE_FILE, state)
    return jsonify(state[emp_id])

@app.route("/api/employees", methods=["GET"])
def get_employees():
    return jsonify(read_json(EMPLOYEES_FILE))

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=False)
