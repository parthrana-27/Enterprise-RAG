import os
import sys
import time
import subprocess

def run_cmd(cmd, cwd=None, wait=True):
    print(f"Executing: {cmd} in {cwd or 'current directory'}")
    shell = sys.platform == "win32"
    if wait:
        res = subprocess.run(cmd, shell=shell, cwd=cwd)
        return res.returncode == 0
    else:
        return subprocess.Popen(cmd, shell=shell, cwd=cwd)

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    infra_dir = os.path.join(root_dir, "infrastructure")
    backend_dir = os.path.join(root_dir, "backend")

    print("=== Enterprise Knowledge Assistant Local Runner ===")
    
    # 1. Start Docker containers (Postgres + Redis)
    print("\n[Step 1/3] Spinning up Postgres and Redis containers...")
    docker_cmd = "docker compose -f docker-compose.yml up -d db redis"
    if not run_cmd(docker_cmd, cwd=infra_dir):
        print("Error: Failed to start docker containers. Ensure Docker Desktop is running and docker-compose is available.")
        sys.exit(1)
        
    print("Database & Redis services started. Waiting 4 seconds for PostgreSQL to initialize...")
    time.sleep(4)

    # 2. Check dependencies
    print("\n[Step 2/3] Verifying python requirements...")
    try:
        import fastapi
        import uvicorn
        import sqlalchemy
        import pgvector
        import jose
        import passlib
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Please install requirements first using:")
        print(f"pip install -r {os.path.join(backend_dir, 'requirements.txt')}")
        # We don't exit here, just warn in case they want to run it anyway
    
    # 3. Start Backend server
    print("\n[Step 3/3] Starting FastAPI monolith server on http://localhost:8000 ...")
    os.environ["POSTGRES_HOST"] = "localhost"
    os.environ["REDIS_HOST"] = "localhost"
    
    # Start uvicorn
    backend_cmd = "uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
    proc = run_cmd(backend_cmd, cwd=backend_dir, wait=False)
    
    try:
        print("\nFastAPI monolitih server running! Press Ctrl+C to terminate.")
        proc.wait()
    except KeyboardInterrupt:
        print("\nTerminating backend server...")
        proc.terminate()
        # Spin down containers
        print("Stopping Docker containers...")
        run_cmd("docker compose -f docker-compose.yml stop", cwd=infra_dir)
        print("Shutdown complete.")

if __name__ == "__main__":
    main()
