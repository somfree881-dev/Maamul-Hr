"""Windowless entry point: startup failures log types only, never tracebacks or config."""
from logging.handlers import RotatingFileHandler
import logging
from pathlib import Path
import os
import sys

if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    os.chdir(root)
    state = root / 'state'
    state.mkdir(exist_ok=True)
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s',
                        handlers=[RotatingFileHandler(state/'connector.log',maxBytes=2_000_000,backupCount=5)])
    try:
        from connector import main
        main()
    except SystemExit:
        raise
    except Exception as error:
        logging.error('Connector startup/runtime failed (%s); scheduler will retry',type(error).__name__)
        sys.exit(1)
