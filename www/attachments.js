var A = A || {};

(function($) {

    function basepath() {
        var psplit = window.location.pathname.split('/');
        var pname = psplit[psplit.length-1];
        if(pname.indexOf('.htm') > 0) {
            pname = psplit.slice(1, psplit.length-1).join('/') + '/';
        }
        else if(psplit.length>1) {
            pname = psplit.slice(1).join('/');
        }
        return window.location.host + '/' +  pname;
    }

    $.Attachments = function(dbpath) {
        // Connect
        var proto = window.location.protocol;
        var wsproto = 'ws://';
        if(proto[proto.length-2] == 's') {
            wsproto = 'wss://';
        }

        var wsurl = wsproto + (dbpath ? window.location.host + dbpath : basepath() + "_attach");        
        var proto = window.location.protocol;

        this.upload_queue = [];   // [{file: File, success_cb:, progress_cb: }]
        this.cur_uploading= null; // {} | null

        this.socket = new WebSocket(wsurl);
        this.socket.onmessage = this._onmessage.bind(this)
        this.socket.onclose = this._onclose.bind(this)        
    }

    $.Attachments.prototype.put_file = function(file, success_cb, progress_cb) {
        this.upload_queue.push({file: file, success_cb: success_cb, progress_cb: progress_cb})

        if(!this.cur_uploading) {
            this.start_next_upload();
        }
    }
    $.Attachments.prototype.start_next_upload = function() {
        if(this.upload_queue.length == 0){
            return
        }

        this.cur_uploading = this.upload_queue.splice(0,1)[0];

        var f = this.cur_uploading.file;

        // Send metadata to server
        var meta = {type: "start-upload", filename: f.name, size: f.size}
        this.socket.send(JSON.stringify(meta));

        this.cur_idx = 0;
        this.cur_size = meta.size;

        this.send_next_chunk();
    }
    $.Attachments.prototype.send_next_chunk = function() {
        // ~128kb
        var chunk_len = Math.min(Math.pow(2, 18), this.cur_size - this.cur_idx);
        var chunk = this.cur_uploading.file.slice(this.cur_idx, this.cur_idx+chunk_len);
        this.socket.send(chunk);
        this.cur_idx += chunk_len;
    }

    $.Attachments.prototype._onmessage = function(e) {
        var res = JSON.parse(e.data);
        if(res.type == 'upload-started') {
            console.log('got id', res.id);
            this.cur_id = res.id;
        }
        else if(res.type == "got-chunk") {
            this.cur_uploading.progress = res.size;
            if(this.cur_uploading.progress_cb) {
                this.cur_uploading.progress_cb(res.size, this.cur_uploading);
            }
            this.send_next_chunk();
        }
        else if(res.type == "upload-finished") {
            console.log('finished! starting next upload')

            var cb = this.cur_uploading.success_cb;

            var upl_doc = this.cur_uploading
            this.cur_uploading = null;

            if(cb) {
                cb(res, upl_doc);
            }

            this.start_next_upload();
        }
        else {
            this.onunknown(res);
        }
    }
    $.Attachments.prototype.onunknown = function(cmd) {
        console.log("Unknown command", cmd);
    }
    $.Attachments.prototype._onclose = function() {
        alert("connection to database closed. will reload");
        window.setTimeout(function() {
            window.location.reload();
        }, 2000);
    }
})(A);
