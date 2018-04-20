#!/usr/bin/env python3

from PyQt5 import QtWidgets, QtCore
from PyQt5.QtCore import pyqtSignal

import logging
import os
import tarfile
import tempfile
import threading
from twisted.internet import reactor
import webbrowser
import sys

#from drift2.__version__ import __version__
#from drift2.paths import get_resource
#import serve
__version__="2.0"

def get_open_port(desired=0):
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("",desired))
    except socket.error:
        return get_open_port(0)
    s.listen(1)
    port = s.getsockname()[1]
    s.close()
    return port

PORT = get_open_port(9898)

# Start a thread for the web server.
# webthread = threading.Thread(target=serve.serve, args=(PORT,))
# webthread.start()

def open_browser():
    webbrowser.open("http://localhost:%d/" % (PORT))

def open_about():
    webbrowser.open("https://rmozone.com/drift")

app = QtWidgets.QApplication(sys.argv)

w = QtWidgets.QWidget()
w.resize(250, 150)
w.setWindowTitle('drift2')

def quit_server():
    app.exit()

layout = QtWidgets.QVBoxLayout()
w.setLayout(layout)

txt = QtWidgets.QLabel('''Drift v%s

Words and intonation.''' % (__version__))
layout.addWidget(txt)

btn = QtWidgets.QPushButton('Open in browser')
btn.setStyleSheet("font-weight: bold;")
layout.addWidget(btn)
btn.clicked.connect(open_browser)

abt = QtWidgets.QPushButton('About Drift')
layout.addWidget(abt)
abt.clicked.connect(open_about)

quitb = QtWidgets.QPushButton('Quit')
layout.addWidget(quitb)
quitb.clicked.connect(quit_server)

w.show()

w.raise_()
w.activateWindow()
 
app.exec_()

# logging.info("Waiting for server to quit.")
# reactor.callFromThread(reactor.stop)
# webthread.join()
