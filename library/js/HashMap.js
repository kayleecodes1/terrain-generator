function HashMap()
{
    this.length = 0;
    this.map = {};

    this.put = function(key, value)
    {
        var previous = undefined;
        if (this.hasKey(key)) {
            previous = this.map[key];
        }
        else {
            this.length++;
        }
        this.map[key] = value;
        return previous;
    }

    this.get = function(key) {
        return this.hasKey(key) ? this.map[key] : undefined;
    }

    this.hasKey = function(key)
    {
        return this.map.hasOwnProperty(key);
    }
   
    this.remove = function(key)
    {
        if (this.hasKey(key)) {
            previous = this.map[key];
            this.length--;
            delete this.map[key];
            return previous;
        }
        else {
            return undefined;
        }
    }

    this.keys = function()
    {
        var keys = [];
        for (var k in this.map) {
            if (this.hasKey(k)) {
                keys.push(k);
            }
        }
        return keys;
    }

    this.values = function()
    {
        var values = [];
        for (var k in this.map) {
            if (this.hasKey(k)) {
                values.push(this.map[k]);
            }
        }
        return values;
    }

    this.each = function(fn) {
        for (var k in this.map) {
            if (this.haskey(k)) {
                fn(k, this.map[k]);
            }
        }
    }

    this.clear = function()
    {
        this.items = {};
        this.length = 0;
    }
}