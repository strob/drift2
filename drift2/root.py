from __future__ import print_function
from __future__ import absolute_import

import os
import traceback

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from twisted.web.server import Site
from twisted.web.static import File
from twisted.internet import reactor

def _load_module(path, g={}):
    source = open(path).read()
    code = compile(source, path, 'exec')
    exec(code, g)
    return g

class Ev2CB(FileSystemEventHandler):
    def __init__(self, pathmap):
        self.pathmap = pathmap  # {path: cb}
        FileSystemEventHandler.__init__(self)

    def get_cb(self, ev):
        # print('get_cb', ev.src_path, ev)
        for path in self.pathmap.keys():
            if os.path.abspath(ev.src_path) == os.path.abspath(path):
                return self.pathmap[path]
        return None

    def on_created(self, ev):
        cb = self.get_cb(ev)
        if cb:
            cb()
    def on_deleted(self, ev):
        pass
    def on_modified(self, ev):
        cb = self.get_cb(ev)
        if cb:
            cb()

# def print_errors(f):
#     def g(*a, **kw):
#         try:
#             f(*a, **kw)
#         except Exception:
#             traceback.print_exc()
#
#    return g

def _monitor_changes(path, cb):
    obs = Observer()
    e2cb = Ev2CB({path: cb})
    obs.schedule(e2cb, os.path.dirname(os.path.abspath(path)))
    obs.start()
    return obs


class Root(object):
    def __init__(self, port=8000, interface='0.0.0.0', dirpath='.'):
        self._port = port
        self._interface = interface
        self._root = File(dirpath)

    def putChild(self, name, res):
        self._root.putChild(name, res)

    def run_forever(self):
        site = Site(self._root)
        reactor.listenTCP(self._port, site, interface=self._interface)
        print("http://localhost:%d" % (self._port))
        reactor.run()        

def serve(path, g, root=None, **kw):
    if root is None:
        root = Root(**kw)

    def load():
        print('load!')
        g['root'] = root
        try:
            module = _load_module(path, g=g)
        except Exception:
            traceback.print_exc()
            return

        # for k,v in module.items():
        #     root.cbs[k] = print_errors(v)

    load()
    obs = _monitor_changes(path, load)
    try:
        root.run_forever()
    except KeyboardInterrupt:
        pass
    finally:
        obs.stop()
    obs.join()
