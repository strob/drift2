var T = T || {};

if(!T.attach) {
    T.attach = new A.Attachments();
}
if(!T.tracking) {
    T.tracking = true;
    FARM.track();
}
T.docs = T.docs || {};          // id -> Meta

function get_docs() {
    return Object.keys(T.docs)
        .map((x) => Object.assign({}, T.docs[x], {id: x}))
        .sort((x,y) => x.date > y.date ? -1 : 1);
}

function next_id() {
    // XXX: Check for collisions
    return "" + Math.round(10000000000 * Math.random());
}
if(!T.next_id) {
    T.next_id = next_id();
}

function render_header(root) {
    new PAL.Element("h2", {
        parent: root,
        id: 'head',
        text: "drift2",
        events: {
            onclick: () => {
                window.location.hash = "";
            }
        }
    });
}

function render_uploader(root) {
    var upl = new PAL.Element("div", {
        parent: root,
        id: "item-" + T.next_id,
        classes: ['upload', 'listitem', T.drag_over ? 'drag' : ''],
        text: T.drag_over ? "Release files to upload" : "Drag audio files here to upload",
        events: {
            ondragover: function(ev) {
                ev.stopPropagation();
                ev.preventDefault();
                ev.dataTransfer.dropEffect = "copy";
                
                T.drag_over=true;
                render();
            },
            ondragleave: function(ev) {
                ev.stopPropagation();
                ev.preventDefault();

                T.drag_over=false;
                render();
            },
            ondrop: function(ev) {
                ev.stopPropagation();
                ev.preventDefault();
                        
                console.log("drop");
                T.drag_over=false;
                render();

                got_files(ev.dataTransfer.files);
            }
        }
    });
    new PAL.Element("br", {
        id: "u-br",
        parent: upl});
    
    new PAL.Element("input", {
        parent: upl,
        attrs: {
            type: "file",
            multiple: true
        },
        id: "upl2",
        events: {
            onchange: function(ev) {
                got_files(ev.target.files);
            }
        }
    });
}

function got_files(files) {
    if(files.length > 0) {
        for(var i=0; i<files.length; i++) {
            
            (function(file) {

                var drift_doc = {
                    id: T.next_id,
                    title: file.name,
                    size: file.size,
                    date: new Date().getTime()/1000
                };
                T.next_id = next_id();

                FARM.post_json("/_create", drift_doc, (ret) => {

                    T.docs[ret.id] = ret.create;
                    render();

                    T.attach.put_file(file, function(x) {
                        console.log('done', x);

                        FARM.post_json("/_update", {
                            id: ret.id,
                            update: {path: x.path}
                        }, (ret) => {
                            Object.assign(T.docs[ret.id], ret.update);
                            render();

                            // Immediately trigger a pitch trace
                            T.docs[ret.id].pitch_loading = true;
                            FARM.post_json("/_pitch", {id: ret.id}, (p_ret) => {
                                console.log("pitch returned");

                                T.docs[ret.id].pitch_loading = false;
                                T.docs[ret.id].pitch = p_ret.pitch;
                                render();
                            });
                        });

                    }, function(p, cur_uploading) {
                        T.docs[ret.id].upload_status = p / ret.create.size;
                        render();
                    });

                });
                
            })(files[i]);
        }
    }
}

function render_doclist(root) {
    // XXX: preload list of docs
    get_docs()
        .forEach((doc) => {
            var docel = new PAL.Element("div", {
                parent: root,
                id: "item-" + doc.id,
                classes: ['listitem'],
                text: doc.title,
                events: {
                    onclick: () => {
                        window.location.hash = doc.id;
                    }
                }
            });

            if(doc.upload_status && !doc.path) {
                // Show progress
                new PAL.Element("progress", {
                    id: doc.id + '-progress',
                    parent: docel,
                    attrs: {
                        max: "100",
                        value: "" + Math.floor((100*doc.upload_status))
                    },
                })
            }
            if(!doc.pitch) {
                new PAL.Element("div", {
                    id: doc.id + "-pload",
                    parent: docel,
                    text: "Computing pitch...",
                    events: {
                        onclick: (ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            
                            FARM.post_json("/_pitch", {id: doc.id}, (ret) => {
                                console.log("pitch returned");

                                T.docs[doc.id].pitch_loading = false;
                                T.docs[doc.id].pitch = ret.pitch;
                                render();
                            });

                        }
                    }
                });
            }
        });
}

function render_doc(root) {
    if(!T.cur_db.loaded) {
        new PAL.Element("div", {
            parent: root,
            text: "Loading..."
        });
        return;
    }

    var meta = T.cur_db.get("meta");
    new PAL.Element("h3", {
        id: "h3",
        parent: root,
        text: meta.title
    });
}

function render() {
    var root = new PAL.Root();

    render_header(root);

    if(T.cur_doc) {
        render_doc(root);
    }
    else {
        render_uploader(root);
        render_doclist(root);
    }
    
    root.show();
}

function setup_doc() {
    T.cur_db = new BS.DB(undefined, "/_doc/" + T.cur_doc);
    T.cur_db.onload = () => {
        render();
        T.cur_db.onupdate = render;
    }
}
function teardown_doc() {
    T.cur_db.socket.onclose = null;
    T.cur_db.socket.close();
}

window.onhashchange = () => {
    var docid = window.location.hash.slice(1);
    console.log("hash", docid, window);
    
    if(docid in T.docs) {
        T.cur_doc = docid;
        setup_doc();
    }
    else if(docid) {
        window.location.hash = "";
        return;
    }
    else {
        if(T.cur_doc) {
            teardown_doc();
        }
        T.cur_doc = undefined;
    }
    render();
}

render();
window.onhashchange();
