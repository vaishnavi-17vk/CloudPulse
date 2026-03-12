import sys
import os
sys.path.insert(0, os.getcwd())
try:
    from main import predict, PredictRequest, db
    print("Imports success")
    req = PredictRequest(component='saas_database', resource='dtu')
    print("Running predict...")
    res = predict(req)
    print("Success:", res)
except Exception as e:
    import traceback
    traceback.print_exc()
