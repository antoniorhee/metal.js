(function() {
  'use strict';

  /**
   * EventEmitter utility.
   * @constructor
   */
  lfr.EventEmitter = function() {
    this.listenersTree_ = new lfr.Trie();
  };

  /**
   * Holds event listeners that trigger for all event types.
   * @type {Array}
   * @private
   */
  lfr.EventEmitter.prototype.all_ = null;

  /**
   * The delimiter being used for namespaces.
   * @type {string}
   * @private
   */
  lfr.EventEmitter.prototype.delimiter_ = '.';

  /**
   * Holds event listeners scoped by event type.
   * @type {Trie}
   * @private
   */
  lfr.EventEmitter.prototype.listenersTree_ = null;

  /**
   * The maximum number of listeners allowed for each event type. If the number
   * becomes higher than the max, a warning will be issued.
   * @type {number}
   * @private
   */
  lfr.EventEmitter.prototype.maxListeners_ = 10;

  /**
   * Adds a listener to the end of the listeners array for the specified event.
   * @param {string} event
   * @param {!Function} listener
   * @return {!Object} Returns emitter, so calls can be chained.
   */
  lfr.EventEmitter.prototype.addListener = function(event, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Listener must be a function');
    }

    this.emit('newListener', event, listener);

    var listeners = this.listenersTree_.setKeyValue(
      this.splitNamespaces(event),
      [listener],
      this.mergeListenerArrays_
    );

    if (listeners.length > this.maxListeners_ && !listeners.warned) {
      console.warning(
        'Possible EventEmitter memory leak detected. %d listeners added ' +
        'for event %s. Use emitter.setMaxListeners() to increase limit.',
        listeners.length,
        event
      );
      listeners.warned = true;
    }

    return this;
  };

  /**
   * Execute each of the listeners in order with the supplied arguments.
   * @param {string} event
   * @param {*} opt_args [arg1], [arg2], [...]
   * @return {boolean} Returns true if event had listeners, false otherwise.
   */
  lfr.EventEmitter.prototype.emit = function(event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var listened = false;
    var listeners = this.listeners(event);
    listeners = listeners ? listeners.concat(this.all_) : this.all_;

    if (listeners) {
      for (var i = 0; i < listeners.length; i++) {
        if (listeners[i]) {
          listeners[i].apply(this, args);
          listened = true;
        }
      }
    }
    return listened;
  };

  /**
   * Gets the delimiter to be used by namespaces.
   * @return {string}
   */
  lfr.EventEmitter.prototype.getDelimiter = function() {
    return this.delimiter_;
  };

  /**
   * Returns an array of listeners for the specified event.
   * @param {string} event
   * @return {Array} Array of listeners.
   */
  lfr.EventEmitter.prototype.listeners = function(event) {
    return this.listenersTree_.getKeyValue(this.splitNamespaces(event));
  };

  /**
   * Returns an array of listeners that fire on any event.
   * @return {Array} Array of listeners.
   */
  lfr.EventEmitter.prototype.listenersAny = function() {
    return this.all_;
  };

  /**
   * Adds a one time listener for the event. This listener is invoked only the
   * next time the event is fired, after which it is removed.
   * @param {string} event
   * @param {number} amount The amount of times this event should be listened to.
   * @param {!Function} listener
   * @return {!Object} Returns emitter, so calls can be chained.
   */
  lfr.EventEmitter.prototype.many = function(event, amount, listener) {
    var self = this;

    if (amount <= 0) {
      return;
    }

    function handlerInternal() {
      if (--amount === 0) {
        self.removeListener(event, handlerInternal);
      }
      listener.apply(self, arguments);
    }
    handlerInternal.origin = listener;

    self.on(event, handlerInternal);

    return this;
  };

  /**
   * Merges two objects that contain event listeners.
   * @param  {!Object} arr1
   * @param  {!Object} arr2
   * @return {!Object}
   */
  lfr.EventEmitter.prototype.mergeListenerArrays_ = function(arr1, arr2) {
    for (var i = 0; i < arr2.length; i++) {
      arr1.push(arr2[i]);
    }
    return arr1;
  };

  /**
   * Remove a listener from the listener array for the specified event.
   * Caution: changes array indices in the listener array behind the listener.
   * @param {string} event
   * @param {!Function} listener
   * @return {!Object} Returns emitter, so calls can be chained.
   */
  lfr.EventEmitter.prototype.off = function(event, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Listener must be a function');
    }

    var listeners = this.listeners(event);
    if (Array.isArray(listeners)) {
      for (var i = 0; i < listeners.length; i++) {
        if (listeners[i] === listener ||
          (listeners[i].origin && listeners[i].origin === listener)) {
          listeners.splice(i, 1);
          break;
        }
      }
    }

    return this;
  };

  /**
   * Removes a listener that would be fired when any event type is emitted.
   * @param {!Function} listener [description]
   * @return {!Object} Returns emitter, so calls can be chained.
   */
  lfr.EventEmitter.prototype.offAny = function(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Listener must be a function');
    }
    if (!this.all_) {
      return this;
    }

    var i = this.all_.indexOf(listener);
    if (i < 0) {
      return this;
    }
    this.all_.splice(i, 1);

    return this;
  };

  /**
   * Adds a listener to the end of the listeners array for the specified event.
   * @param {string} event
   * @param {!Function} listener
   * @return {!Object} Returns emitter, so calls can be chained.
   */
  lfr.EventEmitter.prototype.on = lfr.EventEmitter.prototype.addListener;

  /**
   * Adds a listener that will be fired when any event type is emitted.
   * @param  {!Function} listener [description]
   * @return {!Object} Returns emitter, so calls can be chained.
   */
  lfr.EventEmitter.prototype.onAny = function(listener) {
    if (!this.all_) {
      this.all_ = [];
    }

    this.all_.push(listener);
    return this;
  };

  /**
   * Adds a one time listener for the event. This listener is invoked only the
   * next time the event is fired, after which it is removed.
   * @param {string} event
   * @param {!Function} listener
   * @return {!Object} Returns emitter, so calls can be chained.
   */
  lfr.EventEmitter.prototype.once = function(event, listener) {
    return this.many(event, 1, listener);
  };

  /**
   * Removes all listeners, or those of the specified event. It's not a good
   * idea to remove listeners that were added elsewhere in the code,
   * especially when it's on an emitter that you didn't create.
   * @param {string} event
   * @return {!Object} Returns emitter, so calls can be chained.
   */
  lfr.EventEmitter.prototype.removeAllListeners = function(opt_event) {
    if (opt_event) {
      this.listenersTree_.setKeyValue(this.splitNamespaces(opt_event), []);
    } else {
      this.listenersTree_.clear();
      delete this.all_;
    }
    return this;
  };

  /**
   * Remove a listener from the listener array for the specified event.
   * Caution: changes array indices in the listener array behind the listener.
   * @param {string} event
   * @param {!Function} listener
   * @return {!Object} Returns emitter, so calls can be chained.
   */
  lfr.EventEmitter.prototype.removeListener = lfr.EventEmitter.prototype.off;

  /**
   * Sets the delimiter to be used by namespaces.
   * @param {string} delimiter
   * @return {!Object} Returns emitter, so calls can be chained.
   */
  lfr.EventEmitter.prototype.setDelimiter = function(delimiter) {
    this.delimiter_ = delimiter;
    return this;
  };

  /**
   * By default EventEmitters will print a warning if more than 10 listeners
   * are added for a particular event. This is a useful default which helps
   * finding memory leaks. Obviously not all Emitters should be limited to 10.
   * This function allows that to be increased. Set to zero for unlimited.
   * @param {number} max The maximum number of listeners.
   * @return {!Object} Returns emitter, so calls can be chained.
   */
  lfr.EventEmitter.prototype.setMaxListeners = function(max) {
    this.maxListeners_ = max;
    return this;
  };

  /**
   * Splits the event, using the current delimiter.
   * @return {!Array}
   */
  lfr.EventEmitter.prototype.splitNamespaces = function(event) {
    return typeof event === 'string' ? event.split(this.delimiter) : event;
  };

}());