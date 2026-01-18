"""
Local Development Server for F1 Telemetry API
Includes concurrency support for smoother frontend experience.
"""

import http.server
import json
from urllib.parse import urlparse, parse_qs
from lambda_function import get_summary_data, get_telemetry_data, RACE_NAME

PORT = 8000

class F1APIHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        
        request_type = params.get('type', ['summary'])[0]
        
        # CORS Headers
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        try:
            if request_type == 'summary':
                print(f"Fetching Summary...")
                data = get_summary_data()
            elif request_type == 'telemetry':
                driver_number = int(params.get('driver_number', [44])[0])
                lap_number = int(params.get('lap_number', [1])[0])
                print(f"Fetching Telemetry: Driver {driver_number}, Lap {lap_number}")
                data = get_telemetry_data(driver_number, lap_number)
            else:
                data = {"error": f"Unknown type: {request_type}"}
            
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
            print(f"Done.")
            
        except Exception as e:
            error_data = {"error": str(e)}
            self.wfile.write(json.dumps(error_data).encode('utf-8'))
            print(f"Error: {e}")
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    print(f"Starting Local Server on port {PORT}...")
    print(f"Race: {RACE_NAME}")
    
    # ThreadingHTTPServer enables concurrent request handling
    server = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), F1APIHandler)
    print(f"Ready on http://localhost:{PORT}")
    server.serve_forever()
