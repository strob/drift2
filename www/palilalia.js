var PAL = PAL || {};
(function($) {

    var cur_root;

    // attrs include:
    //  - id: unique identifier (should be consistent in repeated calls)
    //  - parent: parent element
    //  - text: text node
    //  - children: list of children
    //  - hash: if this string changes, element may need to be updated
    //  - attrs: HTML attributes
    //  - events: JS events attached to this element
    //  - listeners: JS event listeners attached to this element
    //  - styles: CSS styles
    //  - unordered: DOM-order of children irrelevant (default: false)

    PAL.Element = function(nodename, attrs) {
        this._name = nodename;
        this._attrs = attrs || {};
        this._id = this._attrs.id || this.getHash();
        if(this._attrs.parent) {
            this.setParent(this._attrs.parent);
        }
        this._children = this._attrs.children || [];
    }
    PAL.Element.prototype.setParent = function(p) {
        this._attrs.parent = p;
        this._attrs.parent.addChild(this);
    }
    PAL.Element.prototype.addChild = function(c) {
        this._children.push(c);
    }
    PAL.Element.prototype.renderElement = function(node) {
        // Render an element, or updates a node's existing $el if
        // appropriate.

        node = node || {};

        this.$el = node.$el || document.createElement(this._name);
        this.$text = node.$text || document.createTextNode("");
        if(!node.$text) {
            this.$el.appendChild(this.$text);
        }

        // Only re-render when there's been a change
        if(Object.keys(node).length == 0 || node.getHash() != this.getHash()) {
            this.getElement(this.$el, this.$text);
        }
        else {
            // Re-apply functions bc contexts may have changed w/out text changing
            Object.keys(this._attrs.events || {})
                .forEach(function(k) {
                    this.$el[k] = this._attrs.events[k];
                }, this);
        }
    }
    PAL.Element.prototype.getChildren = function() {
        // Returns this node's children
        if(this._attrs.unordered) {
            return this._children.sort(function(x,y) { return x._id > y._id ? 1 : -1; });
        }
        return this._children;
    }
    PAL.Element.prototype.update = function(node) {
        // Updates a node's state, if given
        this.renderElement(node);

        // Compare children by ID
        var node_children = node ? node.getChildren() : [];
        var node_children_by_id = {};
        node_children.forEach(function(c) {
            node_children_by_id[c._id] = c;
        })

        var cur_node_idx = -1;

        this.getChildren()
            .forEach(function(child) {

                // Recursively update
                child.update(node_children_by_id[child._id]);

                if(child._id in node_children_by_id) {
                    //console.log('update el', child._id);
                    
                    // Element was updated: indicate by removing from `node_children_by_id`
                    
                    var node_idx = node_children.indexOf(node_children_by_id[child._id]);
                    if(node_idx < cur_node_idx) {
                        // out of order: re-insert before next item
                        this.$el.insertBefore(child.$el, (node_children[cur_node_idx+1] || {}).$el);
                    }
                    else {
                        cur_node_idx = node_idx;
                    }

                    delete node_children_by_id[child._id];
                }
                else {
                    // TEMP: check for duplicates
                    if(node_children.map(function(x) { return x._id; }).indexOf(child._id) >= 0) {
                        console.log("ERROR: Duplicate element", child._id);
                        return;
                    }
                    
                    //console.log('new el', child._id);
                    
                    // New element: append to DOM before the next item
                    this.$el.insertBefore(child.$el, (node_children[cur_node_idx+1] || {}).$el);
                }
            }, this);

        // Remove a node's former children
        Object.keys(node_children_by_id)
            .forEach(function(id) {
                this.$el.removeChild(node_children_by_id[id].$el);
            }, this);
    }
    PAL.Element.prototype.getHash = function() {
        // Returns a unique string for this element
        if(this._attrs.hash) {
            return this._attrs.hash;
        }
        
        return "<" + this._name +
            (this._attrs.attrs ? " " + dictHash(this._attrs.attrs) : "" )+
            (this._attrs.classes ? ' className="' + listHash(this._attrs.classes) + '"' : "") +
            (this._attrs.id ? ' id="' + this._attrs.id + '"' : "") +
            // (this is not quite correct for styles)
            (this._attrs.styles ? ' style="' + dictHash(this._attrs.styles) + '"' : "") +
            (this._attrs.events ? " " + dictHash(this._attrs.events, functionquote) : "") + ">" +
            (this._attrs.text || "") +
            "</" + this._name + ">";
    }
    PAL.Element.prototype.getElement = function($el, $txt) {
        if(this._attrs.id) {
            $el.id = this._attrs.id;
        }

        var keys = Object.keys(this._attrs.attrs || {});

        keys.forEach(function(k) {
            if($el.getAttribute(k) != this._attrs.attrs[k]) {
                $el.setAttribute(k, this._attrs.attrs[k]);
            }
        }, this);

        // normalize to lowercase
        keys = keys
            .map(function(x) { return x.toLowerCase(); });

        var remove = [];
        for (var i=0; i < $el.attributes.length; i++) {
            var name = $el.attributes.item(i).name;
            if (name != "id" && keys.indexOf(name) == -1) {
                remove.push(name);
            }
        }
        remove.forEach(function(name) {
            $el.attributes.removeNamedItem(name);
        });

        if(this._attrs.classes) {
            $el.className = listHash(this._attrs.classes);
        }

        // & will not un-set styles
        Object.keys(this._attrs.styles || {})
            .forEach(function(k) {
                $el.style[k] = this._attrs.styles[k];
            }, this);
        // ibid
        Object.keys(this._attrs.events || {})
            .forEach(function(k) {
                $el[k] = this._attrs.events[k];
            }, this);

        // ...add listeners
        // TODO: may need to *remove* listeners!
        Object.keys(this._attrs.listeners || {})
            .forEach(function(k) {
                $el.addEventListener(k, this._attrs.listeners[k], true);
            }, this);

        $txt.textContent = this._attrs.text || "";

        return $el;
    }
    PAL.Element.prototype.getElementById = function(id) {
        if(this._id == id) {
            return this;
        }
        else {
            // Recurse
            var ret = null;
            this.getChildren()
                .forEach(function(c) {
                    var c_ret = c.getElementById(id);
                    if(c_ret) {
                        ret = c_ret;
                    }
                });
            return ret;
        }
    }

    PAL.Root = function() {
        PAL.Element.call(this, "body", {});
    }
    PAL.Root.prototype = new PAL.Element;
    PAL.Root.prototype.renderElement = function(node) {
        node = node || {};

        this.$el = node.$el || document.body;

        // XXX: Why does the body have/need a text node?
        this.$text = node.$text || document.createTextNode("");
        if(!node.$text) {
            this.$el.appendChild(this.$text);
        }
    }
    PAL.Root.prototype.show = function() {
        this.update(cur_root);
        cur_root = this;
    }

    function listHash(x) {
        return x.sort().join(" ");
    }

    function dictHash(x, fn) {
        fn = fn || function(x) { return x; }; // (identity)

        return Object.keys(x)
            .sort()
            .map(function(k) {
                return k + '="' + fn(x[k]) + '"';
            }).join(" ");
    }

    function quote(x) {
        return x.replace(/"/g, '\\"');
    }

    function functionquote(x) {
        return quote(x.toString());
    }
    
    
})(PAL);
