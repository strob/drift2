import os
import random
import tempfile
import subprocess

from drift2.util import Get

def create(cmd):
    docid = cmd['id']
    del cmd['id']

    while docid in dbs:
        # Clobber ID if necessary...
        docid = str(int(random.random()*1e8))

    # Create a babystep DB w/cmd as metadoc
    dbs[docid] = Babysteps(os.path.join(get_local(), 'doc', docid))
    docroot.putChild(docid, dbs[docid])

    cmd.update({"_id": "meta"})

    bschange(dbs[docid], {
        "type": "set",
        "id": "meta",
        "val": cmd
    })
    print("RET", {"id": docid, "create": cmd})
    
    return {"id": docid, "create": cmd}

root.putChild("_create", PostJson(create))

def update(cmd):
    docid = cmd['id']
    del cmd['id']

    bschange(dbs[docid], {
        "type": "set",
        "id": "meta",
        "val": cmd['update']
    })

    return {"id": docid, "update": cmd['update']}

root.putChild("_update", PostJson(update))

def pitch(cmd):
    docid = cmd['id']

    meta = get_meta(docid)

    # Create an 8khz wav file
    with tempfile.NamedTemporaryFile(suffix='.wav') as wav_fp:
        subprocess.call([get_ffmpeg(),
                         '-y',
                         '-loglevel', 'panic',
                         '-i', os.path.join(get_local(), '_attachments', meta['path']),
                         '-ar', '8000',
                         '-ac', '1',
                         wav_fp.name])

        # ...and use it to compute pitch
        with tempfile.NamedTemporaryFile(suffix='.txt', delete=False) as pitch_fp:
            subprocess.call([get_calc_sbpca(),
                             wav_fp.name, pitch_fp.name])

    if len(open(pitch_fp.name).read().strip()) == 0:
        return {"error": "Pitch computation failed"}

    # XXX: frozen attachdir
    pitchhash = attach(pitch_fp.name)

    bschange(dbs[docid], {
        "type": "set",
        "id": "meta",
        "key": "pitch",
        "val": pitchhash
        })
    
    return {"pitch": pitchhash}

root.putChild("_pitch", PostJson(pitch, async=True))

def list_docs():
    # XXX: Only expose this within certain configurations (ie. not in a deployment)
    return dict([(id, get_meta(id)) for id in dbs.keys()])

root.putChild("_list_docs.json", Get(list_docs))

def align(cmd):

    meta = get_meta(cmd['id'])

    media = os.path.join(get_local(), '_attachments', meta['path'])
    transcript = os.path.join(get_local(), '_attachments', meta['transcript'])
    
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as fp:
        # XXX: Check if Gentle is running

        url = 'http://localhost:8765/transcriptions?async=false'

        t_opts = []
        if transcript:
            t_opts = ['-F', 'transcript=<%s' % (transcript)]
            # Adding disfluencies may be unreliable...
            # url += '&disfluency=true'

        # XXX: can I count on `curl` on os x? I think so?
        subprocess.call(['curl',
                '-o', fp.name,
                '-X', 'POST',
                '-F', 'audio=@%s' % (media)] + t_opts + [url])

    alignhash = attach(fp.name)

    bschange(dbs[cmd['id']], {
        "type": "set",
        "id": "meta",
        "key": "align",
        "val": alignhash
        })
    
    return {"align": alignhash}
    

root.putChild("_align", PostJson(align, async=True))
