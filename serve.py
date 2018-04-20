import drift2
from drift2.util import Babysteps, attach, bschange, PostJson

import glob
import os

from twisted.web.resource import Resource
from twisted.web.static import File

def get_ffmpeg():
    # XXX: Check if bundled
    return 'ffmpeg'
def get_local():
    # XXX: check if bundled
    return 'local'
def get_calc_sbpca():
    return './calc_sbpca/python/SAcC.py'

def get_meta(id):
    return dbs[id]._factory.steps.db.get('meta')

def serve(port=9898):
    root = drift2.Root(port=port, dirpath='www')

    root.putChild("_attach",drift2.Attachments())
    root.putChild('_stage', drift2.Codestage(wwwdir='www'))

    docroot = Resource()
    root.putChild('_doc', docroot)

    dbs = {}                        # id -> Babysteps
    for dbpath in glob.glob(os.path.join(get_local(), 'doc', '[0-9]*')):
        key = dbpath.split('/')[-1]
        dbs[key] = Babysteps(dbpath)
        docroot.putChild(key, dbs[key])

    # Serve attachments
    root.putChild("media", File(os.path.join(get_local(), '_attachments')))

    drift2.serve('stage.py', globals(), root=root)

if __name__=='__main__':
    serve()
