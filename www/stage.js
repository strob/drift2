var T = T || {};

if(!T.attach) {
    T.attach = new A.Attachments();
}
if(!T.tracking) {
    T.tracking = true;
    FARM.track();
}
if(!T.docs) {
    T.docs = {};
    FARM.get_json("/_list_docs.json", (ret) => {
        T.docs = ret;
        window.onhashchange();
        render();
    });
}
if(!T.cur_zoom) {
    T.cur_zoom = 0.1;
}

T.transpastes = T.transpastes||{};


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
                            FARM.post_json("/_pitch", {id: ret.id}, (p_ret) => {
                                console.log("pitch returned");

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

            var doc_has_everything = doc.path && doc.transcript;
            
            var docel = new PAL.Element("div", {
                parent: root,
                id: "item-" + doc.id,
                classes: ['listitem', doc_has_everything ? 'ready' : 'pending'],
                events: {
                    onclick: () => {
                        if(doc.path && doc.transcript) {
                            window.location.hash = doc.id;
                        }
                    }
                }
            });

            new PAL.Element("div", {
                id: "title-" + doc.id,
                classes: ['title'],
                text: doc.title,
                parent: docel});

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

                                T.docs[doc.id].pitch = ret.pitch;
                                render();
                            });

                        }
                    }
                });
            }
            if(!doc.transcript) {
                render_paste_transcript(docel, doc.id);
            }
        });
}

function render_paste_transcript(root, docid) {

    new PAL.Element("div", {
        parent: root,
        id: "ptrans-" + docid,
        classes: ['paste'],
        text: "paste in a transcript to continue"
    });
    
    T.transpastes[docid] = new PAL.Element("textarea", {
        parent: root,
        id: 'tscript-' + docid,
        classes: ['ptext'],
        events: {
            onclick: (ev) => {
                ev.stopPropagation();
            }
        }
    });
    new PAL.Element("br", {
        id: 'br-' + docid,
        parent: root
    });

    new PAL.Element("button", {
        parent: root,
        text: "set transcript",
        events: {
            onclick: (ev) => {

                ev.preventDefault();
                ev.stopPropagation();

                // XXX: do something to prevent dual-submission...
                
                var txt = T.transpastes[docid].$el.value;
                if(txt) {
                    var blob = new Blob([txt]);
                    blob.name = "_paste.txt";
                    T.attach.put_file(blob, function(ret) {
                        // Uploaded transcript!
                        FARM.post_json("/_update", {
                            id: docid,
                            update: {transcript: ret.path}
                        }, (ret) => {
                            Object.assign(T.docs[docid], ret.update);
                            render();

                            // Immediately trigger an alignment
                            FARM.post_json("/_align", {id: docid}, (p_ret) => {
                                console.log("align returned");

                                T.docs[ret.id].align = p_ret.align;
                                render();
                            });

                            
                        });
                    });
                }

            }
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

    if(!T.doc_ready) {
        new PAL.Element("div", {
            id: "not-ready",
            parent: root,
            text: 'not yet ready...'
        });

        return;
    }

    if(!(T.cur_pitch && T.cur_align)) {
        new PAL.Element("div", {
            id: "doc-loading",
            parent: root,
            text: 'Loading...'
        });

        return;
    }

    T.audio_el = new PAL.Element("audio", {
        id: "audio",
        parent: root,
        attrs: {
            controls: true,
            src: "/media/" + meta.path
        }
    });

    render_doc_graph(root);    

    var para_el = new PAL.Element("div", {
        id: "payload-para",
        parent: root,
        classes: ['paragraph']
    });

    render_doc_paragraph(para_el);

    // Render zoom slider
    var zoom_box = new PAL.Element("div", {
        id: "zoom",
        parent: root,
        events: {
            onmousedown: function(ev) {
                ev.preventDefault();
                
                var px = (ev.clientX - this.offsetLeft) / this.clientWidth;
                T.cur_zoom = (1-px);
                blit_graph_can();

                (function($el) {
                    window.onmousemove = (ev) => {
                        ev.preventDefault();

                        var px = (ev.clientX - $el.offsetLeft) / $el.clientWidth;
                        px = Math.max(0, Math.min(1, px));
                        T.cur_zoom = (1-px);
                        //blit_graph_can();
                        render();

                    };
                })(this);

                window.onmouseup = (ev) => {
                    ev.preventDefault();
                    window.onmousemove = null;
                    render();
                }
            }
        }
    });

    new PAL.Element("div", {
        parent: zoom_box,
        id: "zoom-text",
        text: 'zoom'
    });

    new PAL.Element("div", {
        parent: zoom_box,
        id: "zoom-status",
        styles: {
            width: "" + Math.round(100*((1-T.cur_zoom)||0.5)) + "%"
        }
    });
}

function render_doc_graph(root) {
    T.graph_can = new PAL.Element("canvas", {
        parent: root,
        id: "graph"
    });
}

function render_doc_paragraph(root) {
    var p_idx = 0;

    var cur_p = new PAL.Element("div", {
        parent: root,
        id: "p-" + p_idx
    });

    var offset_idx = 0;
    T.cur_align.words.forEach((wd, wd_idx) => {
        
        if(wd.startOffset && wd.startOffset > offset_idx) {
            var gap_txt = T.cur_align.transcript.slice(offset_idx, wd.startOffset);
            var newline_idx = gap_txt.indexOf('\n');
            if(newline_idx >= 0) {
                var pre_line_txt = gap_txt.slice(0, newline_idx);
                if(pre_line_txt) {
                    new PAL.Element("span", {
                        parent: cur_p,
                        id: "gap-pre-" + wd_idx,
                        text: pre_line_txt
                    });
                }
                
                // new paragraph
                p_idx += 1;
                cur_p = new PAL.Element("div", {
                    parent: root,
                    id: "p-" + p_idx
                });

                gap_txt = gap_txt.slice(newline_idx);
            }

            // dump (rest of) gap
            new PAL.Element("span", {
                id: "gap-" + wd_idx,
                parent: cur_p,
                text: gap_txt,
            })
        }

        if(wd.endOffset) {
            T.wd_els[wd_idx] = new PAL.Element("span", {
                id: "wd-" + wd_idx,
                text: wd.word,
                parent: cur_p,
                events: {
                    onclick: () => {
                        T.audio_el.$el.currentTime = wd.start;
                    }
                }
            });

            offset_idx = wd.endOffset;
        }
    });

    T.wd_can = new PAL.Element("canvas", {
        id: "wdcan",
        parent: root
    });

    // ...and a little underline here
    T.underline_el = new PAL.Element("div", {
        id: "underline",
        parent: root
    });
}

function place_underline() {
    // see if we have a word intersection

    if(!T.cur_align) {
        return;
    }
    T.cur_align.words
        .forEach((wd, wd_idx) => {
            if(wd.start <= T.cur_t && wd.end >= T.cur_t) {

                var pos = T.wd_pos[wd_idx];
                if(pos) {

                    T.underline_el.$el.style.left = pos.left + pos.width/2 - 4;
                    T.underline_el.$el.style.top = pos.top + 15;
                    
                }
                
            }
        })
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

    if(T.cur_doc) {
        if(T.wd_can) {
            blit_wd_can();
        }
        if(T.graph_can) {
            blit_graph_can();
        }
    }
}

function blit_graph_can() {
    var $can = T.graph_can.$el;

    var w = document.body.clientWidth/2;
    var h = document.body.clientHeight/2;

    $can.setAttribute('width', w);
    $can.setAttribute('height', h*1.25);
    // $can.setAttribute('width', w);
    // $can.setAttribute('height', h*1.25);


    var ctx = $can.getContext('2d');

    var nsecs = 0.1 + (T.cur_zoom||0.5)*30;

    var cur_t = T.cur_t || T.audio_el.$el.currentTime || 0;

    var start = Math.max(0, cur_t - nsecs/2);
    var end = start+nsecs;

    render_waveform(ctx, {start:start, end:end}, {left: 0, top: 0, width: w, height: h}, h);

    // Draw axes
    var y_axes = [50, 100, 150, 200, 250, 300, 350];
    y_axes.forEach((yval) => {
        var y_px = pitch2y(yval, h);

        ctx.fillStyle = "#CFD8DC";
        ctx.fillRect(0, y_px, w, 1);

        ctx.fillStyle = "#90A4AE";        
        ctx.fillText("" + yval + "Hz", 0, y_px-1);
    });

    var graph_end_y = pitch2y(50, h);

    for(var t=Math.ceil(start); t<Math.ceil(end); t++) {

        var x_px = w * ((t-start) / (end-start));
        
        ctx.fillStyle = "#CFD8DC";
        ctx.fillRect(x_px, 0, 1, graph_end_y);

        ctx.fillStyle = "#90A4AE";        
        ctx.fillText("" + t + "s", x_px-5, graph_end_y+10);
    }

    var wd_start_y = pitch2y(75, h);
    
    // Draw in-view words, in-time
    if(T.cur_align) {
        T.cur_align.words.forEach((wd) => {
            if(!wd.end || wd.start >= end || wd.end <= start) {
                return;
            }

            var x = w * ((wd.start - start) / (end-start));

            ctx.fillStyle = "#263238";
            ctx.font = "14pt Arial";
            ctx.fillText(wd.word, x, wd_start_y)

            wd.phones.forEach((ph) => {

                ctx.fillStyle = "#B0BEC5";
                ctx.font = "10pt Arial";
                ctx.fillText(ph.phone.split("_")[0], x, wd_start_y+20)

                var ph_w = w * (ph.duration / (end-start));

                ctx.fillRect(x, wd_start_y+5, ph_w, 2);
                
                x += ph_w;
            });
            
        })
    }

    // ...Finally, a playhead
    ctx.fillStyle = "#E85C41";
    //ctx.fillStyle = "red";
    ctx.fillRect(w * ((cur_t-start)/(end-start)), 0, 1, graph_end_y);
}

function blit_wd_can() {
    var $can = T.wd_can.$el;

    // Compute word positions
    T.wd_pos = {};
    
    var wd_right_max = 0;
    var wd_top_max = 0;
    
    Object.keys(T.wd_els)
        .forEach((wd_idx) => {
            var pos = {
                left: T.wd_els[wd_idx].$el.offsetLeft,
                width: T.wd_els[wd_idx].$el.offsetWidth,
                top: T.wd_els[wd_idx].$el.offsetTop
            };
            
            T.wd_pos[wd_idx] = pos;

            wd_right_max = Math.max(pos.left+pos.width, wd_right_max);
            wd_top_max = Math.max(pos.top, wd_top_max);
        });

    // Size canvas to fit all the words
    $can.setAttribute("width", wd_right_max);
    $can.setAttribute("height", wd_top_max+60);

    var ctx = $can.getContext('2d');

    T.cur_align.words.forEach(function(w, w_idx) {
        if(w_idx in T.wd_pos) {
            render_waveform(ctx, w, T.wd_pos[w_idx]);
        }
    });
}

function render_waveform(ctx, w, rect, p_h) {
    if(!w.end || !T.cur_pitch) {
        return;
    }
    
    // // Draw waveform
    var st_idx = Math.floor(w.start * 100);
    var end_idx = Math.ceil(w.end * 100);
    var step = rect.width / (end_idx - st_idx);

    var x = rect.left;
    var y = rect.top;
    var y_off = 2;

    // ctx.beginPath();
    // ctx.moveTo(x, y + y_off + 30 - data.rms[st_idx]*30);
    // for(var i=st_idx+1; i<=end_idx; i++) {
    //     ctx.lineTo(x + (i-st_idx)*step, y + y_off + 30 - data.rms[i]*30);
    // }
    // for(var i=end_idx; i>=st_idx; i--) {
    //     ctx.lineTo(x + (i-st_idx)*step, y + y_off + 30 + data.rms[i]*30);
    // }
    // ctx.fill();
    
    // ctx.beginPath();
    // Draw pitch trace
    ctx.strokeStyle = "#449A88";
    ctx.lineWidth = 1;

    var offset = 0;
    while(!T.cur_pitch[st_idx+offset]) {
        offset += 1
        if(offset >= T.cur_pitch.length) {
            break;
        }
    }

    var in_line = false;
    for(var i=st_idx; i<=end_idx; i++) {
        if(T.cur_pitch[i]) {
            if(!in_line) {
                ctx.beginPath();
                ctx.moveTo(x + (i-st_idx)*step, y + y_off + pitch2y(T.cur_pitch[i], p_h));
                //ctx.moveTo(x + offset*step, y + y_off + pitch2y(T.cur_pitch[st_idx+offset], p_h));
                in_line = true;
            }
            else {
                ctx.lineTo(x + (i-st_idx)*step, y + y_off + pitch2y(T.cur_pitch[i], p_h));
            }
        }
        else {
            if(in_line) {
                ctx.stroke();
            }
            in_line = false;
        }
    }
    if(in_line) {
        ctx.stroke();
    }
}

function pitch2y(p, p_h) {
    p_h = p_h || 40;
    
    if(p == 0) {
        return p;
    }
    return p_h - (p - T.MIN_PITCH) * T.PITCH_SC * p_h;
}
    

function doc_update() {
    // Check if this update makes a document somehow ... ready, in which case we load some things.
    if(!T.doc_ready) {
        var meta = T.cur_db.get('meta');

        if(meta.pitch && meta.align && meta.path) {
            T.doc_ready = true;

            FARM.get('media/' + meta.pitch, (pitch) => {
                // parse ellis pitch
                T.cur_pitch = pitch.split('\n')
                    .filter((x) => x.length > 5)
                    .map((x) => Number(x.split(' ')[1]));

                var max_pitch = 0;
                var min_pitch = 0;
                T.cur_pitch.forEach(function(x) {
                    if(x > max_pitch) {
                        max_pitch = x;
                    }
                    if(x > 0 && (x < min_pitch || min_pitch == 0)) {
                        min_pitch = x;
                    }
                });
                T.MIN_PITCH = min_pitch;
                T.PITCH_SC = 1 / (max_pitch - min_pitch);
                
                render();
            });
            FARM.get_json('media/' + meta.align, (align) => {
                T.cur_align = align;
                render();
            });
            
        }

    }

    render();
}

function setup_doc() {
    T.doc_ready = false;

    T.cur_align = null;
    T.cur_pitch = null;

    T.wd_can = null;

    T.wd_els = {};              // idx -> Element

    T.cur_db = new BS.DB(undefined, "/_doc/" + T.cur_doc);
    T.cur_db.onload = () => {
        doc_update()
        T.cur_db.onupdate = doc_update;
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


        T.ticking = T.cur_doc;
        tick();
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

function tick() {
    if(T.ticking != T.cur_doc) {
        T.ticking = false;
        return;
    }

    if(T.audio_el && T.audio_el.$el) {
        var t = T.audio_el.$el.currentTime;
        //if(!T.cur_t || Math.abs(t-T.cur_t)>1/50) {
        if(!T.cur_t || t != T.cur_t) {
            T.cur_t = t;
            blit_graph_can();

            place_underline();
        }
    }

    window.requestAnimationFrame(tick);
}

render();

window.onresize = render;
