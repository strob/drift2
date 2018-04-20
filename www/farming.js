// Farming utilities

var FARM = FARM || {};

(function($) {

    $.get = function(url, cb) {
	      var xhr = new XMLHttpRequest();
	      xhr.open("GET", url, true);
	      xhr.onload = function() {
	          cb(this.responseText);
	      }
	      xhr.send();
    }

    $.get_json = function(url, cb) {
        $.get(url, (ret) => {
            cb(JSON.parse(ret));
        });
    }

    $.get_json_args = function(url, data, cb) {
        var url = url + '?';
        Object.keys(data).sort().forEach(function(key) {
            url += key + '=' + data[key] + '&';
        })
        $.get_json(url, cb);
    }
    

    $.post_json = function(url, data, cb) {
	      var xhr = new XMLHttpRequest();
	      xhr.open("POST", url, true);
	      xhr.onload = function() {
	          cb(JSON.parse(this.responseText));
	      }
	      xhr.send(JSON.stringify(data));
    }

    
    $.track = function() {
        var proto = window.location.protocol;
        
        var wsproto = 'ws://';
        if(proto[proto.length-2] == 's') {
            wsproto = 'wss://';
        }
        var wsurl = wsproto + window.location.host + '/_stage';
        var socket = new WebSocket(wsurl);
        socket.onmessage = function(e) {
            var msg = JSON.parse(e.data);
            console.log("stage", msg);
            if(msg.type == 'script') {
                // Append <script> to <body>
                var $script = document.createElement("script");
                $script.src = msg.path;
                document.body.appendChild($script);
            }
            else if(msg.type == 'style') {
                var $link = document.createElement("link");
                $link.setAttribute('rel', 'stylesheet');
                $link.setAttribute('href', msg.path);                
                document.body.appendChild($link);
            }
        }
    }
    
    

})(FARM);
