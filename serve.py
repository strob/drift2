import drift2
from drift2.util import Get, GetArgs
from drift2.util import Babysteps, attach, bschange, PostJson
from drift2.conf import BUNDLE

import csv
import json
import random
import tempfile
import subprocess


import glob
import os

from twisted.web.resource import Resource
from twisted.web.static import File

def get_ffmpeg():
    if BUNDLE:
        return './ffmpeg'
    return 'ffmpeg'
def get_local():
    if BUNDLE:
        return os.path.join(os.environ['HOME'], '.drift2', 'local')
    return 'local'
def get_attachpath():
    return os.path.join(get_local(), '_attachments')
def get_calc_sbpca():
    if BUNDLE:
        return './SAaC'
    return './calc_sbpca/python/SAcC.py'

def get_meta(id):
    return dbs[id]._factory.steps.db.get('meta')

docroot = Resource()
dbs = {}                        # id -> Babysteps

for dbpath in glob.glob(os.path.join(get_local(), 'doc', '[0-9]*')):
    key = dbpath.split('/')[-1]
    dbs[key] = Babysteps(dbpath)
    docroot.putChild(key, dbs[key])
    
def serve(port=9898):
    root = drift2.Root(port=port, dirpath='www')

    root.putChild("_attach", drift2.Attachments(get_attachpath()))
    root.putChild('_stage', drift2.Codestage(wwwdir='www'))

    root.putChild('_doc', docroot)

    # Serve attachments
    root.putChild("media", File(get_attachpath()))

    drift2.serve('stage.py', globals(), root=root)

if __name__=='__main__':
    serve()
