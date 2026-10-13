import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["ALGOPLANR_DATA_DIR"] = _tmp
os.environ["ALGOPLANR_DB"] = os.path.join(_tmp, "test.sqlite3")
os.environ["ALGOPLANR_JETON"] = ""
