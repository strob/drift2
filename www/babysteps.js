var BS = BS || {};

(function($) {

    function basepath() {
        var psplit = window.location.pathname.split('/');
        var pname = psplit[psplit.length-1];
        if(pname.indexOf('.htm') > 0) {
            pname = psplit.slice(1, psplit.length-1).join('/');// + '/';
        }
        else if(psplit.length>1) {
            pname = psplit.slice(1).join('/');
        }
        return window.location.host + '/' +  pname;
    }

    $.DB = function(log, dbpath) {

        this._log = log || [];
        this._docs = {};

        if(log === undefined) {
            // Connect
            var proto = window.location.protocol;
            var wsproto = 'ws://';
            if(proto[proto.length-2] == 's') {
                wsproto = 'wss://';
            }

            var wsurl = wsproto + (dbpath ? window.location.host + dbpath : basepath() + "_db");
            this.socket = new WebSocket(wsurl);
            this.socket.onmessage = this._onmessage.bind(this)
            this.socket.onclose = this._onclose.bind(this)
        }
        else {
            // If log provided, don't connect to a socket

            // XXX: duplicated code
            this._log.forEach(function(c) {
                this._process_change(c);
            }, this);

            this.loaded = true;
	    // Give us a second to bind something here...
	    window.setTimeout(function() {
		this.onload();
	    }.bind(this), 5);
        }
    }

    $.DB.prototype._onmessage = function(e) {
        var res = JSON.parse(e.data);
        if(res.type == 'history') {
            this._log = res.history;

            this._log.forEach(function(c) {
                this._process_change(c);
            }, this);

            this.loaded = true;
            this.onload();
        }
        else {
            // XXX: should be a list of changes
            this._log.push(res);
            this._process_change(res);
        }
    }

    $.DB.prototype._process_change = function(c) {
        if(c.type == 'set') {
            this._set(c.id, c.key, c.val);
            this._docs[c.id]._date = c.date;
            // Store "creation date"
            if(!this._docs[c.id]._cdate) {
                this._docs[c.id]._cdate = c.date;
            }
        }
        else if(c.type == 'remove') {
            this._remove(c.id, c.key);
        }
        else if("_" + c.type in this) {
            c['date'] = new Date().getTime() / 1000;
            this["_" + c.type](c);
        }
        else {
            console.log('unknown change', c);
        }
    }

    // --
    // Accessors
    // --
    
    $.DB.prototype.get = function(id, key) {
        var doc = this._docs[id];
        if(doc && key) {
            doc = doc[key];
        }
        return doc;
    }
    $.DB.prototype.items = function() {
        return Object.keys(this._docs)
            .map(function(x) { return this._docs[x]; }, this);
    }
    $.DB.prototype.snapshot = function(idx) {
        return new $.DB(this._log.slice(0, idx+1));
    }

    // --
    // Setters
    // --
    $.DB.prototype.set = function(id,key,val) {
        id = id || this.next_id();
        
        this._set(id, key, val);
        var logentry = {type: 'set', id: id, key: key, val: val, date: new Date().getTime()/1000};
        this._log.push(logentry);
        if(this.socket) {
            this.socket.send(JSON.stringify(logentry));
        }

        return this.get(id);
    }
    $.DB.prototype.remove = function(id,key) {
        this._remove(id, key);
        var logentry = {type: 'remove', id: id, key: key, date: new Date().getTime()/1000};
        this._log.push(logentry);
        if(this.socket) {
            this.socket.send(JSON.stringify(logentry));
        }
    }
    $.DB.prototype.batch = function(changes) {
        // TODO: this should presumably be pseudo-atomic wrt mutable state & events
        changes.forEach(function(c) {
            this._log.push(c);
            this._process_change(c);
            // TODO: should send to socket all at once
            if(this.socket) {
                this.socket.send(JSON.stringify(c));
            }
        }, this);
        //this.socket.send(JSON.stringify(changes));
    }
    

    // --
    // Internal functions to update _doc state from a change
    // --
    $.DB.prototype._set = function(id, key, val) {
        var olddoc = this._docs[id] || {};
        if(key !== null && key !== undefined) {
            var doc = {};
            for(var okey in olddoc) {
                doc[okey] = olddoc[okey];
            }
            doc[key] = val;
        }
        else {
            // Caller invariant: `val` must be an object (not a primitive)
            var doc = Object.assign({}, olddoc, val);
        }
        
        // Force doc to maintain ID
        doc._id = id;
        // Set time to current time (will be overridden by server)
        doc._date = new Date().getTime() / 1000;

        this._docs[id] = doc;

        this.onupdate('set', id, key, val);
    }
    $.DB.prototype._remove = function(id, key) {
        var doc = this._docs[id];
        
        if(!key) {
            delete this._docs[id];
        }
        else {
            delete doc[key];
        }

        this.onupdate('remove', id, key);
    }
    // TODO: insert/splice


    // --
    // Events
    // -- 
    $.DB.prototype._onclose = function(e) {
        console.log("lost connection to db - reloading in 2secs");
        window.setTimeout(function() {
            window.location.reload();
        }, 2000);
    }

    $.DB.prototype.onload = function() {
        // client should override
    }
    $.DB.prototype.onupdate = function() {
        // client should override
    }

    // --
    // Misc
    // --
    $.DB.prototype.next_id = function() {
        var uid = null;
        while(!uid || uid in this._docs) {
            uid = 'id_' + Math.floor(Math.random()*100000);
        }
        return uid;
    }

    $.DB.prototype.close = function() {
        // Close socket connection -- without firing events
        this.socket.onclose = null;
        this.socket.close();
    }

    
})(BS);
