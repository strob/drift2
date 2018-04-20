from __future__ import absolute_import

from twisted.web.static import File
from twisted.web.resource import Resource
from twisted.internet import reactor
from twisted.web.server import NOT_DONE_YET
from autobahn.twisted.websocket import WebSocketServerProtocol, \
                                       WebSocketServerFactory
from autobahn.twisted.resource import WebSocketResource
from autobahn.twisted.resource import WebSocketResource

from watchdog.observers import Observer
import hashlib
import json
import os
import time

from . import root
from . import attachments
from . import babysteps

class Get(Resource):
    def __init__(self, fn):
        self._fn = fn
        Resource.__init__(self)

    def render_GET(self, req):
        return self._fn()

class GetArgs(Resource):
    # TODO: make async (?)
    def __init__(self, fn, fileout=False):
        self._fileout = fileout
        self._fn = fn
        Resource.__init__(self)

    def render_GET(self, req):
        args = {}
        for k,v in req.args.items():
            if len(v) == 1:
                args[k] = v[0]
            elif len(v) > 1:
                args[k] = v
        ret = self._fn(**args)
        if self._fileout:
            return File(ret).render_GET(req)
        return json.dumps(ret)
    
class PostJson(Resource):
    def __init__(self, fn, async=False):
        self._fn = fn

        self._async = async
        
        Resource.__init__(self)

    def render_POST(self, req):
        cmd = json.load(req.content)
        # Pass through access to the request

        if not self._async:
            return json.dumps(
                self._fn(cmd))
        else:
            reactor.callInThread(self._call_fn, cmd, req)
            return NOT_DONE_YET

    def _call_fn(self, cmd, req):
        ret = self._fn(cmd)
        reactor.callFromThread(self._finish_req, req, ret)

    def _finish_req(self, req, ret):
        req.write(json.dumps(ret))
        req.finish()

JsonPost = PostJson

def Babysteps(dbpath="db"):
    factory = babysteps.DBFactory(dbpath=dbpath)
    factory.protocol = babysteps.DBProtocol
    return WebSocketResource(factory)

def Attachments(attachdir="local/_attachments"):
    a_factory = attachments.AttachFactory(attachdir=attachdir)
    a_factory.protocol = attachments.AttachProtocol
    return WebSocketResource(a_factory)

def attach(filepath, attachdir="local/_attachments"):
    # XXX: This should be in the attachments.py file probably
    sha1 = hashlib.sha1()
    with open(filepath) as fh:
        buf = fh.read(2**15)
        while len(buf) > 0:
            sha1.update(buf)
            buf = fh.read(2**15)

    return attachments.move_to_database(filepath, sha1.hexdigest(), attachdir)

def bschange(bs, change):
    def do_change(changedoc):
        bs._factory.onchange(None, changedoc)
    reactor.callFromThread(do_change, change)


class StageFactory(WebSocketServerFactory):
    def __init__(self, scriptpath='stage.js', csspath='stage.css', wwwdir=''):
        self.scriptpath = scriptpath
        self.csspath = csspath

        self.wwwdir = wwwdir

        # Set up monitors
        self.obs = Observer()
        e2cb = root.Ev2CB({
            os.path.join(wwwdir, self.scriptpath): self._onscriptchange,
            os.path.join(wwwdir, self.csspath): self._oncsschange})

        # XXX: stage and css must be in same directory!
        self.obs.schedule(e2cb, os.path.realpath(wwwdir))
        self.obs.start()

        self.clients = {}

        WebSocketServerFactory.__init__(self)

    def _onscriptchange(self):
        path = self.scriptpath + '?t=%f' % time.time()
        reactor.callFromThread(self.push_all, json.dumps({"path": path, "type": "script"}))
        
    def _oncsschange(self):
        path = self.csspath + '?t=%f' % time.time()
        reactor.callFromThread(self.push_all, json.dumps({"path": path, "type": "style"}))

    def push_all(self, msg):
        print("pushing!", msg)
        for client in self.clients.values():
            client.sendMessage(msg)

    def register(self, client):
        self.clients[client.peer] = client

        # initialize w/a hit to both paths
        client.sendMessage(json.dumps({"path": self.scriptpath+ '?t=%f' % time.time(), "type": "script"}))
        client.sendMessage(json.dumps({"path": self.csspath+ '?t=%f' % time.time(), "type": "style"}))

    def unregister(self, client):
        if client.peer in self.clients:
            del self.clients[client.peer]

class StageProtocol(WebSocketServerProtocol):
    def onOpen(self):
        self.factory.register(self)
        WebSocketServerProtocol.onOpen(self)

    def connectionLost(self, reason):
        self.factory.unregister(self)
        WebSocketServerProtocol.connectionLost(self, reason)

    def onMessage(self, payload, isBinary):
        # XXX: should clients be able to stage changes?
        pass

def Codestage(scriptpath='stage.js', csspath='stage.css', wwwdir='.'):
    factory = StageFactory(scriptpath=scriptpath, csspath=csspath, wwwdir=wwwdir)
    factory.protocol = StageProtocol
    return WebSocketResource(factory)
