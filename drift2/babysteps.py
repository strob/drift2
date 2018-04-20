# minimal seatbelt-like realtime websocket database thing

from autobahn.twisted.websocket import WebSocketServerProtocol, \
                                       WebSocketServerFactory
from autobahn.twisted.resource import WebSocketResource
from twisted.web.static import File
from twisted.web.server import Site
from twisted.internet import reactor

import time
import json
import os
import uuid

class Babysteps:
    def __init__(self, log=[], bs=None):
        self.bs = bs
        self.log = []
        self.db  = {}

        self.loaded = False
        for entry in log:
            self.append(entry)
        self.loaded = True

    def next_id(self):
        uid = None
        while uid is None or uid in self.db:
            uid = uuid.uuid4().get_hex()[:8]
        return uid

    def append(self, change):
        self.log.append(change)

        # Trivial DB accumulation
        if change.get('type') == 'set':
            doc = dict(self.db.get(change['id'], {}))
            
            if change.get('key') is not None:
                doc[change['key']] = change['val']
                #self.db.setdefault(change['id'], {})[change['key']] = change['val']
            else:
                doc.update(change['val'])
                #self.db[change['id']] = change['val']
            self.db[change['id']] = doc

        if change.get('type') == 'remove':
            if change.get('key') is not None:
                doc = dict(self.db[change['id']])
                del doc[change['key']]
                self.db[change['id']] = doc
            else:
                del self.db[change['id']]

    @classmethod
    def fromfile(cls, path):
        return cls([json.loads(X) for X in open(path) if X.strip()])

                 
class DBFactory(WebSocketServerFactory):
    def __init__(self, dbpath="db", Stepper=Babysteps):
        WebSocketServerFactory.__init__(self)
        self.clients = {}       # peerstr -> client

        self.dbpath = dbpath
        dbdir = os.path.dirname(self.dbpath)
        try:
            os.makedirs(dbdir)
        except OSError:
            pass

        self.steps = Stepper(log=self.load_db(), bs=self)

        # Create a changelog
        self.change_fh = open(os.path.join(self.dbpath), 'a')

    def load_db(self):
        if not os.path.exists(self.dbpath):
            return []
        try:
            return [json.loads(X) for X in open(self.dbpath) if len(X.strip()) > 0]
        except ValueError:
            import IPython; IPython.embed()

    def register(self, client):
        self.clients[client.peer] = client

        # Send entire history
        # TODO: login & update_seq
        client.sendMessage(json.dumps(
            {"type": "history",
             "history": self.steps.log}))

    def unregister(self, client):
        if client.peer in self.clients:
            del self.clients[client.peer]
            print 'unregistered client', len(self.clients), 'remain'

    def onchange(self, sender, change_doc):
        if change_doc.get("seq_idx"):
            if change_doc["seq_idx"] != len(self.steps.log):
                sender.sendMessage(json.dumps({"type": "seq-confirm", "status": "fail"}))
                return

        change_doc['date'] = time.time()
        change_doc['peer'] = sender.peer if sender is not None else '_server'

        # TODO: server should enforce consistent order
        
        self.steps.append(change_doc)

        self.change_fh.write("%s\n" % (json.dumps(change_doc)))
        self.change_fh.flush()

        for client in self.clients.values():
            if client != sender:
                client.sendMessage(json.dumps(change_doc))
            # TODO: server should confirm update to sender (w/date)

        if change_doc.get("seq_idx"):
            sender.sendMessage(json.dumps({"type": "seq-confirm", "status": "succeed"}))


class DBProtocol(WebSocketServerProtocol):
    def onOpen(self):
        self.factory.register(self)
        WebSocketServerProtocol.onOpen(self)

    def connectionLost(self, reason):
        self.factory.unregister(self)
        WebSocketServerProtocol.connectionLost(self, reason)

    def onMessage(self, payload, isBinary):
        if not isBinary:
            change_doc = json.loads(payload)
            self.factory.onchange(self, change_doc)

if __name__=='__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9779
    
    factory = DBFactory()
    factory.protocol = DBProtocol
    ws_resource = WebSocketResource(factory)

    root = File('.')
    root.putChild('_db', ws_resource)
    site = Site(root)

    reactor.listenTCP(port, site, interface='0.0.0.0')
    print 'http://localhost:%d' % (port)
    reactor.run()
