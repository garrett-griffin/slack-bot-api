/* eslint-disable no-console */
/* eslint-disable consistent-return */
/* eslint-disable import/no-nodejs-modules */
/* eslint-disable import/no-commonjs */
/* eslint-disable no-var */

'use strict';

var _ = require('lodash');
var request = require('request');
var Vow = require('vow');
var extend = require('extend');
var WebSocket = require('ws');
var EventEmitter = require('events').EventEmitter;
var { setWsHeartbeat } = require('ws-heartbeat/client');

class Bot extends EventEmitter {
  /**
   * @param {object} params
   * @constructor
   */

  constructor(params) {
    super(params);
    this.token = params.token;
    this.name = params.name;
    this.disconnect = params.disconnect;

    console.assert(params.token, 'token must be defined');
    if (!this.disconnect) {
      this.login();
    }
  }

  /**
   * Starts a Real Time Messaging API session
   */
  login() {
    // Enable Presence Subscriptions
    var params = {
      batch_presence_aware: 1,
      process_sub: 1
    };
    this._api('rtm.start', params)
      .then(data => {
        this.wsUrl = data.url;
        this.self = data.self;
        this.team = data.team;
        this.channels = data.channels;
        this.users = data.users;
        this.ims = data.ims;
        this.groups = data.groups;

        this.emit('start');

        this.connect();
      })
      .fail(data => {
        this.emit('error', new Error(data.error ? data.error : data));
      })
      .done();
  }

  /**
   * Establish a WebSocket connection
   */
  connect() {
    this.ws = new WebSocket(this.wsUrl);

    setWsHeartbeat(this.ws, '{ "type": "ping" }');

    this.ws.on('open', data => {
      this.emit('open', data);
    });

    this.ws.on('close', data => {
      this.emit('close', data);
    });

    this.ws.on('message', data => {
      try {
        this.emit('message', JSON.parse(data));
      } catch (e) {
        console.log(e);
      }
    });
  }

  /**
   * Get channels
   * @returns {vow.Promise}
   */
  getChannels() {
    if (this.channels) {
      return Vow.fulfill({ channels: this.channels });
    }
    return this._api('channels.list');
  }

  /**
   * Get users
   * @returns {vow.Promise}
   */
  getUsers() {
    if (this.users) {
      return Vow.fulfill({ members: this.users });
    }

    return this._api('users.list');
  }

  /**
   * Get groups
   * @returns {vow.Promise}
   */
  getGroups() {
    if (this.groups) {
      return Vow.fulfill({ groups: this.groups });
    }

    return this._api('groups.list');
  }

  /**
   * Get user by name
   * @param {string} name
   * @returns {object}
   */
  getUser(name) {
    return this.getUsers().then(data => {
      var res = _.find(data.members, { name });

      console.assert(res, 'user not found');
      return res;
    });
  }

  /**
   * Get channel by name
   * @param {string} name
   * @returns {object}
   */
  getChannel(name) {
    return this.getChannels().then(data => {
      var res = _.find(data.channels, { name });

      console.assert(res, 'channel not found');
      return res;
    });
  }

  /**
   * Get group by name
   * @param {string} name
   * @returns {object}
   */
  getGroup(name) {
    return this.getGroups().then(data => {
      var res = _.find(data.groups, { name });

      console.assert(res, 'group not found');
      return res;
    });
  }

  /**
   * Get user by id
   * @param {string} id
   * @returns {object}
   */
  getUserById(id) {
    return this.getUsers().then(data => {
      var res = _.find(data.members, { id });

      console.assert(res, 'user not found');
      return res;
    });
  }

  /**
   * Get channel by id
   * @param {string} id
   * @returns {object}
   */
  getChannelById(id) {
    return this.getChannels().then(data => {
      var res = _.find(data.channels, { id });

      console.assert(res, 'channel not found');
      return res;
    });
  }

  /**
   * Get group by id
   * @param {string} id
   * @returns {object}
   */
  getGroupById(id) {
    return this.getGroups().then(data => {
      var res = _.find(data.groups, { id });

      console.assert(res, 'group not found');
      return res;
    });
  }

  /**
   * Get channel ID
   * @param {string} name
   * @returns {string}
   */
  getChannelId(name) {
    return this.getChannel(name).then(channel => channel.id);
  }

  /**
   * Get group ID
   * @param {string} name
   * @returns {string}
   */
  getGroupId(name) {
    return this.getGroup(name).then(group => group.id);
  }

  /**
   * Get user ID
   * @param {string} name
   * @returns {string}
   */
  getUserId(name) {
    return this.getUser(name).then(user => user.id);
  }

  /**
   * Get user by email
   * @param {string} email
   * @returns {object}
   */
  getUserByEmail(email) {
    return this.getUsers().then(data => _.find(data.members, { profile: { email } }));
  }

  /**
   * Get "direct message" channel ID
   * @param {string} name
   * @returns {vow.Promise}
   */
  getChatId(name) {
    return this.getUser(name)
      .then(data => {
        var chatId = _.find(this.ims, { user: data.id });

        return (chatId && chatId.id) || this.openIm(data.id);
      })
      .then(data => (typeof data === 'string' ? data : data.channel.id));
  }

  /**
   * Get "direct message" channel ID
   * @param {string} name
   * @returns {vow.Promise}
   */
  getChatIdFromUserId(userID) {
    return this.getUserById(userID)
      .then(data => {
        var chatId = _.find(this.ims, { user: data.id });

        return (chatId && chatId.id) || this.openIm(data.id);
      })
      .then(data => (typeof data === 'string' ? data : data.channel.id));
  }

  /**
   * Opens a "direct message" channel with another member of your Slack team
   * @param {string} userId
   * @returns {vow.Promise}
   */
  openIm(userId) {
    return this._api('im.open', { user: userId });
  }

  /**
   * Get a list of all im channels
   * @returns {vow.Promise}
   */
  getImChannels() {
    if (this.ims) {
      return Vow.fulfill({ ims: this.ims });
    }
    return this._api('im.list');
  }

  /**
   * Posts an ephemeral message to a channel and user
   * @param {string} id - channel ID
   * @param {string} user - user ID
   * @param {string} text
   * @param {object} params
   * @returns {vow.Promise}
   */
  postEphemeral(id, user, text, params) {
    params = extend(
      {
        text,
        channel: id,
        user,
        username: this.name
      },
      params || {}
    );

    return this._api('chat.postEphemeral', params);
  }

  /**
   * Posts a message to a channel by ID
   * @param {string} id - channel ID
   * @param {string} text
   * @param {object} params
   * @returns {vow.Promise}
   */
  postMessage(id, text, params) {
    params = extend(
      {
        text,
        channel: id,
        username: this.name
      },
      params || {}
    );

    return this._api('chat.postMessage', params);
  }

  /**
   * Updates a message by timestamp
   * @param {string} id - channel ID
   * @param {string} ts - timestamp
   * @param {string} text
   * @param {object} params
   * @returns {vow.Promise}
   */
  updateMessage(id, ts, text, params) {
    params = extend(
      {
        ts,
        channel: id,
        username: this.name,
        text
      },
      params || {}
    );

    return this._api('chat.update', params);
  }

  /**
   * Posts a message to user by name
   * @param {string} name
   * @param {string} text
   * @param {object} params
   * @param {function} cb
   * @returns {vow.Promise}
   */
  postMessageToUser(name, text, params, cb) {
    return this._post((params || {}).slackbot ? 'slackbot' : 'user', name, text, params, cb);
  }

  /**
   * Posts a message to channel by name
   * @param {string} name
   * @param {string} text
   * @param {object} params
   * @param {function} cb
   * @returns {vow.Promise}
   */
  postMessageToChannel(name, text, params, cb) {
    return this._post('channel', name, text, params, cb);
  }

  /**
   * Posts a message to group by name
   * @param {string} name
   * @param {string} text
   * @param {object} params
   * @param {function} cb
   * @returns {vow.Promise}
   */
  postMessageToGroup(name, text, params, cb) {
    return this._post('group', name, text, params, cb);
  }

  /**
   * Common method for posting messages
   * @param {string} type
   * @param {string} name
   * @param {string} text
   * @param {object} params
   * @param {function} cb
   * @returns {vow.Promise}
   * @private
   */
  _post(type, name, text, params, cb) {
    var method = {
      group: 'getGroupId',
      channel: 'getChannelId',
      user: 'getChatId',
      slackbot: 'getUserId'
    }[type];

    if (typeof params === 'function') {
      cb = params;
      params = null;
    }

    return this[method](name)
      .then(itemId => this.postMessage(itemId, text, params))
      .always(data => {
        if (cb) {
          cb(data._value);
        }
      });
  }

  /**
   * Posts a message to group | channel | user
   * @param {string} name
   * @param {string} text
   * @param {object} params
   * @param {function} cb
   * @returns {vow.Promise}
   */
  postTo(name, text, params, cb) {
    return Vow.all([this.getChannels(), this.getUsers(), this.getGroups()]).then(data => {
      name = this._cleanName(name);

      var all = [].concat(data[0].channels, data[1].members, data[2].groups);
      var result = _.find(all, { name });

      console.assert(result, 'wrong name');

      if (result.is_channel) {
        return this.postMessageToChannel(name, text, params, cb);
      } else if (result.is_group) {
        return this.postMessageToGroup(name, text, params, cb);
      }
      return this.postMessageToUser(name, text, params, cb);
    });
  }

  /**
   * Remove @ or # character from group | channel | user name
   * @param {string} name
   * @returns {string}
   */
  // eslint-disable-next-line class-methods-use-this
  _cleanName(name) {
    if (typeof name !== 'string') {
      return name;
    }

    var firstCharacter = name.charAt(0);
    if (firstCharacter === '#' || firstCharacter === '@') {
      name = name.slice(1);
    }
    return name;
  }

  /**
   * Preprocessing of params
   * @param params
   * @returns {object}
   * @private
   */
  _preprocessParams(params) {
    params = extend(params || {}, { token: this.token });

    Object.keys(params).forEach(name => {
      var param = params[name];

      if (param && typeof param === 'object') {
        params[name] = JSON.stringify(param);
      }
    });

    return params;
  }

  /**
   * Send request to API method
   * @param {string} methodName
   * @param {object} params
   * @returns {vow.Promise}
   * @private
   */
  _api(methodName, params) {
    var data = {
      url: 'https://slack.com/api/' + methodName,
      form: this._preprocessParams(params)
    };

    return new Vow.Promise((resolve, reject) => {
      // eslint-disable-next-line no-shadow
      request.post(data, (err, request, body) => {
        if (err) {
          reject(err);

          return false;
        }

        try {
          body = JSON.parse(body);

          // Response always contain a top-level boolean property ok,
          // indicating success or failure
          if (body.ok) {
            resolve(body);
          } else {
            reject(body);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
  }
}

module.exports = Bot;
