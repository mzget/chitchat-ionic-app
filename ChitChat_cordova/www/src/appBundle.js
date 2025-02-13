var ChatLog = (function () {
    function ChatLog(room) {
        this.id = room._id;
        this.roomName = room.name;
        this.roomType = room.type;
        this.room = room;
    }
    ChatLog.prototype.setNotiCount = function (count) {
        this.count = count;
    };
    ChatLog.prototype.setLastMessage = function (lastMessage) {
        this.lastMessage = lastMessage;
    };
    ChatLog.prototype.setLastMessageTime = function (lastMessageTime) {
        this.lastMessageTime = lastMessageTime;
    };
    return ChatLog;
}());
var ChatRoomComponent = (function () {
    function ChatRoomComponent(main, room_id, messageDAL) {
        this.chatMessages = [];
        this.main = main;
        this.serverImp = this.main.getServerImp();
        this.chatRoomApi = this.main.getChatRoomApi();
        this.dataManager = this.main.getDataManager();
        this.roomId = room_id;
        this.messageDAL = messageDAL;
        console.log("constructor ChatRoomComponent");
    }
    ChatRoomComponent.prototype.onChat = function (chatMessageImp) {
        var _this = this;
        var self = this;
        if (this.roomId === chatMessageImp.rid) {
            var secure = new SecureService();
            if (chatMessageImp.type.toString() === ContentType[ContentType.Text]) {
                if (self.serverImp.appConfig.encryption == true) {
                    secure.decryptWithSecureRandom(chatMessageImp.body, function (err, res) {
                        if (!err) {
                            chatMessageImp.body = res;
                            self.chatMessages.push(chatMessageImp);
                            self.messageDAL.saveData(self.roomId, self.chatMessages);
                            if (!!_this.serviceListener)
                                _this.serviceListener(ChatServer.ServerEventListener.ON_CHAT, chatMessageImp);
                        }
                        else {
                            console.log(err, res);
                            self.chatMessages.push(chatMessageImp);
                            self.messageDAL.saveData(self.roomId, self.chatMessages);
                            if (!!_this.serviceListener)
                                _this.serviceListener(ChatServer.ServerEventListener.ON_CHAT, chatMessageImp);
                        }
                    });
                }
                else {
                    self.chatMessages.push(chatMessageImp);
                    self.messageDAL.saveData(self.roomId, self.chatMessages);
                    if (!!this.serviceListener)
                        this.serviceListener(ChatServer.ServerEventListener.ON_CHAT, chatMessageImp);
                }
            }
            else {
                self.chatMessages.push(chatMessageImp);
                self.messageDAL.saveData(self.roomId, self.chatMessages);
                if (!!this.serviceListener)
                    this.serviceListener(ChatServer.ServerEventListener.ON_CHAT, chatMessageImp);
            }
        }
        else {
            console.log("this msg come from other room.");
            if (!!this.notifyEvent) {
                this.notifyEvent(ChatServer.ServerEventListener.ON_CHAT, chatMessageImp);
            }
        }
    };
    ChatRoomComponent.prototype.onLeaveRoom = function (data) {
    };
    ChatRoomComponent.prototype.onRoomJoin = function (data) {
    };
    ChatRoomComponent.prototype.onMessageRead = function (dataEvent) {
        console.log("onMessageRead", JSON.stringify(dataEvent));
        var self = this;
        var newMsg = JSON.parse(JSON.stringify(dataEvent));
        var promise = new Promise(function (resolve, reject) {
            self.chatMessages.some(function callback(value) {
                if (value._id === newMsg._id) {
                    value.readers = newMsg.readers;
                    if (!!self.serviceListener)
                        self.serviceListener(ChatServer.ServerEventListener.ON_MESSAGE_READ, null);
                    resolve();
                    return true;
                }
            });
        }).then(function (value) {
            self.messageDAL.saveData(self.roomId, self.chatMessages);
        });
    };
    ChatRoomComponent.prototype.onGetMessagesReaders = function (dataEvent) {
        console.log('onGetMessagesReaders', dataEvent);
        var self = this;
        var myMessagesArr = JSON.parse(JSON.stringify(dataEvent.data));
        self.chatMessages.forEach(function (originalMsg, id, arr) {
            if (self.dataManager.isMySelf(originalMsg.sender)) {
                myMessagesArr.some(function (myMsg, index, array) {
                    if (originalMsg._id === myMsg._id) {
                        originalMsg.readers = myMsg.readers;
                        return true;
                    }
                });
            }
        });
        self.messageDAL.saveData(self.roomId, self.chatMessages);
    };
    ChatRoomComponent.prototype.getPersistentMessage = function (rid, done) {
        var self = this;
        self.messageDAL.getData(rid, function (err, messages) {
            if (messages !== null) {
                var chats = messages.slice(0);
                async.mapSeries(chats, function iterator(item, result) {
                    if (item.type === ContentType.Text) {
                        if (self.serverImp.appConfig.encryption == true) {
                            self.main.decodeService(item.body, function (err, res) {
                                if (!err) {
                                    item.body = res;
                                    self.chatMessages.push(item);
                                }
                                else {
                                    self.chatMessages.push(item);
                                }
                                result(null, item);
                            });
                        }
                        else {
                            self.chatMessages.push(item);
                            result(null, item);
                        }
                    }
                    else {
                        self.chatMessages.push(item);
                        result(null, item);
                    }
                }, function (err, results) {
                    console.log("decode chats text completed.", self.chatMessages.length);
                    done(err, messages);
                });
            }
            else {
                self.chatMessages = [];
                console.debug("chatMessages", self.chatMessages.length);
                done(err, messages);
            }
        });
    };
    ChatRoomComponent.prototype.getNewerMessageRecord = function (callback) {
        var self = this;
        var lastMessageTime = new Date();
        new Promise(function promise(resolve, reject) {
            if (self.chatMessages[self.chatMessages.length - 1] != null) {
                lastMessageTime = self.chatMessages[self.chatMessages.length - 1].createTime;
                resolve();
            }
            else {
                var roomAccess = self.dataManager.getRoomAccess();
                async.some(roomAccess, function (item, cb) {
                    if (item.roomId === self.roomId) {
                        lastMessageTime = item.accessTime;
                        cb(null, true);
                    }
                    else
                        cb(null, false);
                }, function (result) {
                    console.log(result);
                    if (result) {
                        resolve();
                    }
                    else {
                        reject();
                    }
                });
            }
        })
            .then(function (value) {
            self.getNewerMessageFromNet(lastMessageTime, callback);
        })
            .catch(function (err) {
            console.warn("this room_id is not contain in roomAccess list.");
            self.getNewerMessageFromNet(lastMessageTime, callback);
        });
    };
    ChatRoomComponent.prototype.getNewerMessageFromNet = function (lastMessageTime, callback) {
        var self = this;
        self.chatRoomApi.getChatHistory(self.roomId, lastMessageTime, function (err, result) {
            var histories = [];
            if (result.code === 200) {
                histories = result.data;
                console.log("Newer message counts.", histories.length);
                if (histories.length > 0) {
                    var messages = JSON.parse(JSON.stringify(histories));
                    async.mapSeries(messages, function (item, cb) {
                        if (item.type.toString() === ContentType[ContentType.Text]) {
                            if (self.serverImp.appConfig.encryption == true) {
                                self.main.decodeService(item.body, function (err, res) {
                                    if (!err) {
                                        item.body = res;
                                        self.chatMessages.push(item);
                                    }
                                    else {
                                        self.chatMessages.push(item);
                                    }
                                    cb(null, item);
                                });
                            }
                            else {
                                self.chatMessages.push(item);
                                cb(null, item);
                            }
                        }
                        else {
                            self.chatMessages.push(item);
                            cb(null, item);
                        }
                    }, function done(err) {
                        if (!err) {
                            console.log("get newer message completed.");
                        }
                        else {
                            console.error('get newer message error', err);
                        }
                        console.debug("chatMessage.Count", self.chatMessages.length);
                        //<!-- Save persistent chats log here.
                        self.messageDAL.saveData(self.roomId, self.chatMessages, function (err, result) {
                            //self.getNewerMessageRecord();
                        });
                        if (callback !== null) {
                            callback(null, result.code);
                        }
                    });
                }
                else {
                    console.log("Have no newer message.");
                    if (callback !== null) {
                        callback(null, result.code);
                    }
                }
            }
            else {
                console.warn("WTF god only know.", result.message);
                if (callback !== null) {
                    callback(null, result.code);
                }
            }
        });
    };
    ChatRoomComponent.prototype.getOlderMessageChunk = function (callback) {
        var self = this;
        self.getTopEdgeMessageTime(function done(err, res) {
            self.chatRoomApi.getOlderMessageChunk(self.roomId, res, function response(err, res) {
                //@ todo.
                /**
                 * Merge messages record to chatMessages array.
                 * Never save message to persistend layer.
                 */
                var datas = [];
                datas = res.data;
                var clientMessages = self.chatMessages.slice(0);
                var mergedArray = [];
                if (datas.length > 0) {
                    var messages = JSON.parse(JSON.stringify(datas));
                    mergedArray = messages.concat(clientMessages);
                }
                var resultsArray = [];
                async.map(mergedArray, function iterator(item, cb) {
                    var hasMessage = resultsArray.some(function itor(value, id, arr) {
                        if (value._id == item._id) {
                            return true;
                        }
                    });
                    if (hasMessage == false) {
                        resultsArray.push(item);
                        cb(null, null);
                    }
                    else {
                        cb(null, null);
                    }
                }, function done(err, results) {
                    resultsArray.sort(self.compareMessage);
                    self.chatMessages = resultsArray.slice(0);
                    callback(err, resultsArray);
                    self.messageDAL.saveData(self.roomId, self.chatMessages);
                });
            });
        });
    };
    ChatRoomComponent.prototype.checkOlderMessages = function (callback) {
        var self = this;
        self.getTopEdgeMessageTime(function done(err, res) {
            self.chatRoomApi.checkOlderMessagesCount(self.roomId, res, function response(err, res) {
                callback(err, res);
            });
        });
    };
    ChatRoomComponent.prototype.getTopEdgeMessageTime = function (callback) {
        var self = this;
        var topEdgeMessageTime = null;
        if (self.chatMessages != null && self.chatMessages.length != 0) {
            if (!!self.chatMessages[0].createTime) {
                topEdgeMessageTime = self.chatMessages[0].createTime;
            }
            else {
                topEdgeMessageTime = new Date();
            }
        }
        else {
            topEdgeMessageTime = new Date();
        }
        console.debug('topEdgeMsg:', topEdgeMessageTime, JSON.stringify(self.chatMessages[0]));
        callback(null, topEdgeMessageTime);
    };
    ChatRoomComponent.prototype.compareMessage = function (a, b) {
        if (a.createTime > b.createTime) {
            return 1;
        }
        if (a.createTime < b.createTime) {
            return -1;
        }
        // a must be equal to b
        return 0;
    };
    ChatRoomComponent.prototype.getMessage = function (chatId, Chats, callback) {
        var self = this;
        var myProfile = self.dataManager.myProfile;
        var chatLog = localStorage.getItem(myProfile._id + '_' + chatId);
        var promise = new Promise(function (resolve, reject) {
            if (!!chatLog) {
                console.log("Local chat history has a data...");
                if (JSON.stringify(chatLog) === "") {
                    self.chatMessages = [];
                    resolve();
                }
                else {
                    var arr_fromLog = JSON.parse(chatLog);
                    if (arr_fromLog === null || arr_fromLog instanceof Array === false) {
                        self.chatMessages = [];
                        resolve();
                    }
                    else {
                        console.log("Decode local chat history for displaying:", arr_fromLog.length);
                        // let count = 0;
                        arr_fromLog.map(function (log, i, a) {
                            var messageImp = log;
                            if (messageImp.type === ContentType[ContentType.Text]) {
                                if (self.serverImp.appConfig.encryption == true) {
                                    self.main.decodeService(messageImp.body, function (err, res) {
                                        if (!err) {
                                            messageImp.body = res;
                                            self.chatMessages.push(messageImp);
                                        }
                                        else {
                                            //console.log(err, res);
                                            self.chatMessages.push(messageImp);
                                        }
                                    });
                                }
                                else {
                                    self.chatMessages.push(messageImp);
                                }
                            }
                            else {
                                // console.log("item:", count++, log.type);
                                self.chatMessages.push(log);
                            }
                        });
                        resolve();
                    }
                }
            }
            else {
                console.log("Have no local chat history.");
                self.chatMessages = [];
                resolve();
            }
        });
        promise.then(function onFulfilled() {
            console.log("get local history done:");
            self.serverImp.JoinChatRoomRequest(chatId, function (err, joinRoomRes) {
                if (joinRoomRes.code == 200) {
                    var access = new Date();
                    var roomAccess = self.dataManager.myProfile.roomAccess;
                    async.eachSeries(roomAccess, function iterator(item, cb) {
                        if (item.roomId == chatId) {
                            access = item.accessTime;
                        }
                        cb();
                    }, function done() {
                        self.chatRoomApi.getChatHistory(chatId, access, function (err, result) {
                            var histories = [];
                            if (result.code === 200) {
                                histories = result.data;
                            }
                            else {
                            }
                            var his_length = histories.length;
                            //console.log("new chat log", histories.length);
                            if (his_length > 0) {
                                async.eachSeries(histories, function (item, cb) {
                                    var chatMessageImp = JSON.parse(JSON.stringify(item));
                                    if (chatMessageImp.type === ContentType[ContentType.Text]) {
                                        if (self.serverImp.appConfig.encryption == true) {
                                            self.main.decodeService(chatMessageImp.body, function (err, res) {
                                                if (!err) {
                                                    chatMessageImp.body = res;
                                                    self.chatMessages.push(chatMessageImp);
                                                    cb();
                                                }
                                                else {
                                                    //console.warn(err, res);
                                                    cb();
                                                }
                                            });
                                        }
                                        else {
                                            self.chatMessages.push(chatMessageImp);
                                            cb();
                                        }
                                    }
                                    else {
                                        if (item.type == 'File') {
                                            console.log('file');
                                        }
                                        self.chatMessages.push(item);
                                        cb();
                                    }
                                }, function (err) {
                                    Chats.set(self.chatMessages);
                                    localStorage.removeItem(myProfile._id + '_' + chatId);
                                    localStorage.setItem(myProfile._id + '_' + chatId, JSON.stringify(self.chatMessages));
                                    callback(joinRoomRes);
                                });
                            }
                            else {
                                Chats.set(self.chatMessages);
                                callback(joinRoomRes);
                            }
                        });
                    });
                }
                else {
                    callback(joinRoomRes);
                }
            });
        }).catch(function onRejected(reason) {
            console.warn("promiss.onRejected", reason);
        });
    };
    ChatRoomComponent.prototype.updateReadMessages = function () {
        var self = this;
        async.each(self.chatMessages, function itorator(message, errCb) {
            if (!self.dataManager.isMySelf(message.sender)) {
                if (!!message.readers) {
                    var isReaded = message.readers.some(function (element) {
                        //@ if you readed it.
                        if (self.dataManager.isMySelf(element)) {
                            return true;
                        }
                    });
                    if (isReaded)
                        errCb(null);
                    else {
                        message.readers.push(self.dataManager.myProfile._id);
                        self.chatRoomApi.updateMessageReader(message._id, message.rid);
                        errCb(null);
                    }
                }
                else {
                    message.readers = new Array();
                    message.readers.push(self.dataManager.myProfile._id);
                    self.chatRoomApi.updateMessageReader(message._id, message.rid);
                    errCb(null);
                }
            }
            else {
                errCb(null);
            }
        }, function done(err) {
            //@ done.
            console.warn("Next version we has to call updateMessageReader once time at here.");
        });
    };
    ChatRoomComponent.prototype.updateWhoReadMyMessages = function () {
        var self = this;
        self.getTopEdgeMessageTime(function (err, res) {
            self.chatRoomApi.getMessagesReaders(res);
        });
    };
    ChatRoomComponent.prototype.leaveRoom = function (room_id, callback) {
        var self = this;
        if (self.serverImp._isConnected) {
            self.serverImp.LeaveChatRoomRequest(room_id, function (err, res) {
                console.log("leave room", JSON.stringify(res));
                callback(err, res);
            });
        }
        else {
            console.warn(ChatServer.ServerImplemented.connectionProblemString);
            callback(new Error(ChatServer.ServerImplemented.connectionProblemString), null);
        }
    };
    ChatRoomComponent.prototype.joinRoom = function (callback) {
        var self = this;
        self.serverImp.JoinChatRoomRequest(self.roomId, callback);
    };
    ChatRoomComponent.prototype.getMemberProfile = function (member, callback) {
        this.serverImp.getMemberProfile(member.id, callback);
    };
    return ChatRoomComponent;
}());
var ChatsLogComponent = (function () {
    function ChatsLogComponent(main, server, _convertDateService) {
        this.chatListeners = new Array();
        this.chatslog = {};
        this.main = main;
        this.server = server;
        this._isReady = false;
        this.convertDateService = _convertDateService;
        console.log("ChatsLogComponent : constructor");
    }
    ChatsLogComponent.prototype.addOnChatListener = function (listener) {
        this.chatListeners.push(listener);
    };
    ChatsLogComponent.prototype.onChat = function (dataEvent) {
        console.log("ChatsLogComponent.onChat");
        //<!-- Provide chatslog service.
        this.chatListeners.map(function (v, i, a) {
            v(dataEvent);
        });
    };
    ChatsLogComponent.prototype.onAccessRoom = function (dataEvent) {
        var self = this;
        var dataManager = self.main.getDataManager();
        var roomAccess = JSON.parse(JSON.stringify(dataEvent.roomAccess));
        console.debug("ChatsLogComponent.onAccessRoom", roomAccess.length);
        async.map(roomAccess, function iterator(item, resultCallback) {
            self.main.roomDAL.getData(item.roomId, function (err, roomInfo) {
                if (!err && !!roomInfo) {
                    dataManager.addGroup(roomInfo);
                }
                resultCallback(null, roomInfo);
            });
        }, function done(err, results) {
            self._isReady = true;
            if (!!self.onReady)
                self.onReady();
        });
    };
    ChatsLogComponent.prototype.onUpdatedLastAccessTime = function (dataEvent) {
        console.warn("ChatsLogComponent.onUpdatedLastAccessTime", JSON.stringify(dataEvent));
        if (!!this.updatedLastAccessTimeEvent) {
            this.updatedLastAccessTimeEvent(dataEvent);
        }
    };
    ChatsLogComponent.prototype.onAddRoomAccess = function (dataEvent) {
        console.warn("ChatsLogComponent.onAddRoomAccess", JSON.stringify(dataEvent));
        if (!!this.addNewRoomAccessEvent) {
            this.addNewRoomAccessEvent(dataEvent);
        }
    };
    ChatsLogComponent.prototype.onUpdateMemberInfoInProjectBase = function (dataEvent) {
        console.warn("ChatsLogComponent.onUpdateMemberInfoInProjectBase", JSON.stringify(dataEvent));
    };
    ChatsLogComponent.prototype.onEditedGroupMember = function (dataEvent) {
        console.warn("ChatsLogComponent.onEditedGroupMember", JSON.stringify(dataEvent));
    };
    ChatsLogComponent.prototype.getChatsLog = function () {
        return this.chatslog;
    };
    ChatsLogComponent.prototype.getUnreadMessages = function (roomAccess, callback) {
        var self = this;
        var unreadLogs = [];
        async.mapSeries(roomAccess, function iterator(item, cb) {
            if (!!item.roomId && !!item.accessTime) {
                self.server.getUnreadMsgOfRoom(item.roomId, item.accessTime.toString(), function res(err, res) {
                    if (err || res === null) {
                        console.warn("getUnreadMsgOfRoom: ", err);
                    }
                    else {
                        if (res.code === HttpStatusCode.success) {
                            var unread = JSON.parse(JSON.stringify(res.data));
                            unread.rid = item.roomId;
                            unreadLogs.push(unread);
                        }
                    }
                    cb(null, null);
                });
            }
            else {
                cb(null, null);
            }
        }, function done(err) {
            console.log("getUnreadMessages from your roomAccess is done.");
            callback(null, unreadLogs);
        });
    };
    ChatsLogComponent.prototype.getUnreadMessage = function (roomAccess, callback) {
        this.server.getUnreadMsgOfRoom(roomAccess.roomId, roomAccess.accessTime.toString(), function res(err, res) {
            console.warn("getUnreadMsgOfRoom: ", JSON.stringify(res));
            if (err || res === null) {
                callback(err, null);
            }
            else {
                if (res.code === HttpStatusCode.success) {
                    var unread = JSON.parse(JSON.stringify(res.data));
                    unread.rid = roomAccess.roomId;
                    callback(null, unread);
                }
            }
        });
    };
    ChatsLogComponent.prototype.getRoomInfo = function (room_id, resultCB) {
        var self = this;
        this.server.getRoomInfo(room_id, function (err, res) {
            if (res.code === HttpStatusCode.success) {
                var roomInfo = JSON.parse(JSON.stringify(res.data));
                if (roomInfo.type === RoomType.privateChat) {
                    var targetMemberId_1 = "";
                    roomInfo.members.some(function (item) {
                        if (item.id !== self.main.getDataManager().myProfile._id) {
                            targetMemberId_1 = item.id;
                            return true;
                        }
                    });
                    var contactProfile = self.main.getDataManager().getContactProfile(targetMemberId_1);
                    if (contactProfile == null) {
                        roomInfo.name = "EMPTY ROOM";
                    }
                    else {
                        roomInfo.name = contactProfile.displayname;
                        roomInfo.image = contactProfile.image;
                    }
                }
                else {
                    console.warn("OMG: the god only know. May be group status is not active.");
                }
                self.main.getDataManager().addGroup(roomInfo);
                self.main.roomDAL.saveData(roomInfo._id, roomInfo);
                resultCB(null, roomInfo);
            }
            else {
                resultCB("Cannot get roomInfo", null);
            }
        });
    };
    ChatsLogComponent.prototype.getRoomsInfo = function (unreadMessageMap) {
        var self = this;
        var dataManager = this.main.getDataManager();
        async.map(unreadMessageMap, function iterator(item, resultCB) {
            var roomInfo = dataManager.getGroup(item.rid);
            if (!!roomInfo) {
                self.organizeChatLogMap(item, roomInfo, function done() {
                    resultCB(null, roomInfo);
                });
            }
            else {
                console.warn("Can't find roomInfo from persisted data: ", item.rid);
                self.server.getRoomInfo(item.rid, function (err, res) {
                    if (res.code === HttpStatusCode.success) {
                        var roomInfo_1 = JSON.parse(JSON.stringify(res.data));
                        if (roomInfo_1.type === RoomType.privateChat) {
                            var targetMemberId_2 = "";
                            roomInfo_1.members.some(function (item) {
                                if (item.id !== dataManager.myProfile._id) {
                                    targetMemberId_2 = item.id;
                                    return true;
                                }
                            });
                            var contactProfile = dataManager.getContactProfile(targetMemberId_2);
                            if (contactProfile == null) {
                                roomInfo_1.name = "EMPTY ROOM";
                            }
                            else {
                                roomInfo_1.name = contactProfile.displayname;
                                roomInfo_1.image = contactProfile.image;
                            }
                        }
                        else {
                            console.warn("OMG: the god only know. May be group status is not active.");
                        }
                        dataManager.addGroup(roomInfo_1);
                        self.organizeChatLogMap(item, roomInfo_1, function done() {
                            resultCB(null, roomInfo_1);
                        });
                    }
                    else {
                        console.warn("Fail to get room info of room %s", item.rid, res.message);
                        resultCB(null, null);
                    }
                });
            }
        }, function done(err, results) {
            if (!err) {
                console.log("getRoomsInfo Completed.");
                for (var key in results) {
                    if (results.hasOwnProperty(key)) {
                        var element = results[key];
                        if (!!element)
                            self.main.roomDAL.saveData(element._id, element);
                    }
                }
            }
        });
    };
    ChatsLogComponent.prototype.organizeChatLogMap = function (unread, roomInfo, done) {
        var self = this;
        var dataManager = this.main.getDataManager();
        var log = new ChatLog(roomInfo);
        log.setNotiCount(unread.count);
        if (!!unread.message) {
            log.setLastMessageTime(unread.message.createTime);
            var contact = dataManager.getContactProfile(unread.message.sender);
            var sender = (contact != null) ? contact.displayname : "";
            if (unread.message.body != null) {
                var displayMsg = unread.message.body;
                switch (unread.message.type) {
                    case ContentType[ContentType.Text]:
                        self.main.decodeService(displayMsg, function (err, res) {
                            if (!err) {
                                displayMsg = res;
                            }
                            else {
                                console.warn(err, res);
                            }
                            self.setLogProp(log, displayMsg, function (log) {
                                self.addChatLog(log, done);
                            });
                        });
                        break;
                    case ContentType[ContentType.Sticker]:
                        displayMsg = sender + " sent a sticker.";
                        self.setLogProp(log, displayMsg, function (log) {
                            self.addChatLog(log, done);
                        });
                        break;
                    case ContentType[ContentType.Voice]:
                        displayMsg = sender + " sent a voice message.";
                        self.setLogProp(log, displayMsg, function (log) {
                            self.addChatLog(log, done);
                        });
                        break;
                    case ContentType[ContentType.Image]:
                        displayMsg = sender + " sent a image.";
                        self.setLogProp(log, displayMsg, function (log) {
                            self.addChatLog(log, done);
                        });
                        break;
                    case ContentType[ContentType.Video]:
                        displayMsg = sender + " sent a video.";
                        self.setLogProp(log, displayMsg, function (log) {
                            self.addChatLog(log, done);
                        });
                        break;
                    case ContentType[ContentType.Location]:
                        displayMsg = sender + " sent a location.";
                        self.setLogProp(log, displayMsg, function (log) {
                            self.addChatLog(log, done);
                        });
                        break;
                    case ContentType[ContentType.File]:
                        displayMsg = sender + " sent a File.";
                        self.setLogProp(log, displayMsg, function (log) {
                            self.addChatLog(log, done);
                        });
                        break;
                    default:
                        break;
                }
            }
        }
        else {
            log.setLastMessage("Start Chatting Now!");
            self.setLogProp(log, displayMsg, function (log) {
                self.addChatLog(log, done);
            });
        }
    };
    ChatsLogComponent.prototype.setLogProp = function (log, displayMessage, callback) {
        log.setLastMessage(displayMessage);
        callback(log);
    };
    ChatsLogComponent.prototype.addChatLog = function (chatLog, done) {
        chatLog.time = this.convertDateService.getTimeChatlog(chatLog.lastMessageTime);
        chatLog.timeMsg = new Date(chatLog.lastMessageTime);
        this.chatslog[chatLog.id] = chatLog;
        done();
    };
    ChatsLogComponent.prototype.checkRoomInfo = function (unread) {
        var _this = this;
        return new Promise(function (resolve, rejected) {
            var roomInfo = _this.main.getDataManager().getGroup(unread.rid);
            if (!roomInfo) {
                console.warn("No have roomInfo in room store.", roomInfo);
                _this.getRoomInfo(unread.rid, function (err, res) {
                    if (!!res) {
                        _this.organizeChatLogMap(unread, res, function () {
                            resolve();
                        });
                    }
                    else {
                        rejected();
                    }
                });
            }
            else {
                console.log("Prepare update chats log of room: ", roomInfo.name);
                _this.organizeChatLogMap(unread, roomInfo, function () {
                    resolve();
                });
            }
        });
    };
    return ChatsLogComponent;
}());
var AuthenReducer = (function () {
    function AuthenReducer(_store) {
        this.key = "session_token";
        this.store = _store;
    }
    AuthenReducer.prototype.getData = function (done) {
        this.store.getItem(this.key).then(function (value) {
            var docs = JSON.parse(JSON.stringify(value));
            console.log("get session_token success", value);
            done(null, docs);
        }).catch(function rejected(err) {
            console.warn(err);
            done(err, null);
        });
    };
    AuthenReducer.prototype.saveData = function (authInfo, callback) {
        var self = this;
        this.store.setItem(self.key, authInfo).then(function (value) {
            console.log("save persistent success");
            if (callback != null) {
                callback(null, value);
            }
        }).catch(function rejected(err) {
            console.warn(err);
            self.removeData(self.key);
            if (callback != null) {
                callback(err, null);
            }
        });
    };
    AuthenReducer.prototype.removeData = function (rid, callback) {
        this.store.removeItem(rid).then(function () {
            console.info('room_id %s is removed: ', rid);
            if (callback) {
                callback(null, null);
            }
        }).catch(function (err) {
            console.warn(err);
        });
    };
    AuthenReducer.prototype.clearData = function (next) {
        this.store.clear(function (err) {
            if (err != null) {
                console.warn("Clear database fail", err);
            }
            next(err);
        });
    };
    return AuthenReducer;
}());
var MessageDAL = (function () {
    function MessageDAL(_store) {
        this.store = _store;
    }
    MessageDAL.prototype.getData = function (rid, done) {
        this.store.getItem(rid).then(function (value) {
            var docs = JSON.parse(JSON.stringify(value));
            console.log("get persistent success");
            done(null, docs);
        }).catch(function rejected(err) {
            console.warn(err);
        });
    };
    MessageDAL.prototype.saveData = function (rid, chatRecord, callback) {
        var self = this;
        this.store.setItem(rid, chatRecord).then(function (value) {
            console.log("save persistent success");
            if (callback != null) {
                callback(null, value);
            }
        }).catch(function rejected(err) {
            console.warn(err);
            self.removeData(rid);
            if (callback != null) {
                callback(err, null);
            }
        });
    };
    MessageDAL.prototype.removeData = function (rid, callback) {
        this.store.removeItem(rid).then(function () {
            console.info('room_id %s is removed: ', rid);
            if (callback) {
                callback(null, null);
            }
        }).catch(function (err) {
            console.warn(err);
        });
    };
    MessageDAL.prototype.clearData = function (next) {
        console.warn('MessageDAL.clearData');
        this.store.clear(function (err) {
            if (err != null) {
                console.warn("Clear database fail", err);
            }
            console.warn("message db now empty.");
            next(err);
        });
    };
    return MessageDAL;
}());
var RoomDAL = (function () {
    function RoomDAL(_store) {
        this.store = _store;
    }
    RoomDAL.prototype.getData = function (room_id, done) {
        this.store.getItem(room_id).then(function (value) {
            var docs = JSON.parse(JSON.stringify(value));
            done(null, docs);
        }).catch(function (err) {
            console.warn(err);
            done(err, null);
        });
    };
    RoomDAL.prototype.saveData = function (room_id, roomInfo, callback) {
        var self = this;
        this.store.setItem(room_id, roomInfo)
            .then(function (value) {
            if (callback != null) {
                callback(null, value);
            }
        }).catch(function rejected(err) {
            console.warn(err);
            self.removeData(room_id);
            if (callback != null) {
                callback(err, null);
            }
        });
    };
    RoomDAL.prototype.removeData = function (room_id, callback) {
        this.store.removeItem(room_id)
            .then(function () {
            if (callback) {
                callback(null, null);
            }
        }).catch(function (err) {
            console.warn(err);
        });
    };
    RoomDAL.prototype.clearData = function (next) {
        this.store.clear(function (err) {
            if (err != null) {
                console.warn("Clear database fail", err);
            }
            next(err);
        });
    };
    return RoomDAL;
}());
var DataListener = (function () {
    function DataListener(dataManager) {
        this.notifyNewMessageEvents = new Array();
        this.chatListenerImps = new Array();
        this.roomAccessListenerImps = new Array();
        this.dataManager = dataManager;
    }
    DataListener.prototype.addNoticeNewMessageEvent = function (listener) {
        if (this.notifyNewMessageEvents.length === 0) {
            this.notifyNewMessageEvents.push(listener);
        }
    };
    DataListener.prototype.removeNoticeNewMessageEvent = function (listener) {
        var id = this.notifyNewMessageEvents.indexOf(listener);
        this.notifyNewMessageEvents.splice(id, 1);
    };
    DataListener.prototype.addChatListenerImp = function (listener) {
        this.chatListenerImps.push(listener);
    };
    DataListener.prototype.removeChatListenerImp = function (listener) {
        var id = this.chatListenerImps.indexOf(listener);
        this.chatListenerImps.splice(id, 1);
    };
    DataListener.prototype.addRoomAccessListenerImp = function (listener) {
        this.roomAccessListenerImps.push(listener);
    };
    DataListener.prototype.removeRoomAccessListener = function (listener) {
        var id = this.roomAccessListenerImps.indexOf(listener);
        this.roomAccessListenerImps.splice(id, 1);
    };
    DataListener.prototype.onAccessRoom = function (dataEvent) {
        console.info('onRoomAccess: ', dataEvent);
        this.dataManager.setRoomAccessForUser(dataEvent);
        if (!!this.roomAccessListenerImps) {
            this.roomAccessListenerImps.map(function (value) {
                value.onAccessRoom(dataEvent);
            });
        }
    };
    DataListener.prototype.onUpdatedLastAccessTime = function (dataEvent) {
        this.dataManager.updateRoomAccessForUser(dataEvent);
        if (!!this.roomAccessListenerImps) {
            this.roomAccessListenerImps.map(function (value) {
                value.onUpdatedLastAccessTime(dataEvent);
            });
        }
    };
    DataListener.prototype.onAddRoomAccess = function (dataEvent) {
        var data = JSON.parse(JSON.stringify(dataEvent));
        var roomAccess = data.roomAccess;
        if (roomAccess !== null && roomAccess.length !== 0) {
            this.dataManager.setRoomAccessForUser(dataEvent);
        }
        if (!!this.roomAccessListenerImps) {
            this.roomAccessListenerImps.map(function (value) {
                value.onAddRoomAccess(dataEvent);
            });
        }
    };
    DataListener.prototype.onCreateGroupSuccess = function (dataEvent) {
        var group = JSON.parse(JSON.stringify(dataEvent));
        this.dataManager.addGroup(group);
    };
    DataListener.prototype.onEditedGroupMember = function (dataEvent) {
        var jsonObj = JSON.parse(JSON.stringify(dataEvent));
        this.dataManager.updateGroupMembers(jsonObj);
        if (!!this.roomAccessListenerImps) {
            this.roomAccessListenerImps.map(function (value) {
                value.onEditedGroupMember(dataEvent);
            });
        }
    };
    DataListener.prototype.onEditedGroupName = function (dataEvent) {
        var jsonObj = JSON.parse(JSON.stringify(dataEvent));
        this.dataManager.updateGroupName(jsonObj);
    };
    DataListener.prototype.onEditedGroupImage = function (dataEvent) {
        var obj = JSON.parse(JSON.stringify(dataEvent));
        this.dataManager.updateGroupImage(obj);
    };
    DataListener.prototype.onNewGroupCreated = function (dataEvent) {
        var jsonObj = JSON.parse(JSON.stringify(dataEvent));
        this.dataManager.addGroup(jsonObj);
    };
    DataListener.prototype.onUpdateMemberInfoInProjectBase = function (dataEvent) {
        var jsonObj = JSON.parse(JSON.stringify(dataEvent));
        this.dataManager.updateGroupMemberDetail(jsonObj);
        if (!!this.roomAccessListenerImps) {
            this.roomAccessListenerImps.map(function (value) {
                value.onUpdateMemberInfoInProjectBase(dataEvent);
            });
        }
    };
    //#region User.
    DataListener.prototype.onUserLogin = function (dataEvent) {
        this.dataManager.onUserLogin(dataEvent);
    };
    DataListener.prototype.onUserUpdateImageProfile = function (dataEvent) {
        var jsonObj = JSON.parse(JSON.stringify(dataEvent));
        var _id = jsonObj._id;
        var path = jsonObj.path;
        this.dataManager.updateContactImage(_id, path);
    };
    DataListener.prototype.onUserUpdateProfile = function (dataEvent) {
        var jsonobj = JSON.parse(JSON.stringify(dataEvent));
        var params = jsonobj.params;
        var _id = jsonobj._id;
        this.dataManager.updateContactProfile(_id, params);
    };
    //#endregion
    /*******************************************************************************/
    //<!-- chat room data listener.
    DataListener.prototype.onChat = function (data) {
        var chatMessageImp = JSON.parse(JSON.stringify(data));
        if (!!this.notifyNewMessageEvents && this.notifyNewMessageEvents.length !== 0) {
            this.notifyNewMessageEvents.map(function (v, id, arr) {
                v(chatMessageImp);
            });
        }
        if (!!this.chatListenerImps && this.chatListenerImps.length !== 0) {
            this.chatListenerImps.forEach(function (value, id, arr) {
                value.onChat(chatMessageImp);
            });
        }
        if (!!this.roomAccessListenerImps && this.roomAccessListenerImps.length !== 0) {
            this.roomAccessListenerImps.map(function (v) {
                v.onChat(chatMessageImp);
            });
        }
    };
    ;
    DataListener.prototype.onLeaveRoom = function (data) {
        if (!!this.chatListenerImps && this.chatListenerImps.length !== 0) {
            this.chatListenerImps.forEach(function (value) {
                value.onLeaveRoom(data);
            });
        }
    };
    ;
    DataListener.prototype.onRoomJoin = function (data) {
    };
    ;
    DataListener.prototype.onMessageRead = function (dataEvent) {
        if (!!this.chatListenerImps && this.chatListenerImps.length !== 0) {
            this.chatListenerImps.forEach(function (value) {
                value.onMessageRead(dataEvent);
            });
        }
    };
    ;
    DataListener.prototype.onGetMessagesReaders = function (dataEvent) {
        if (!!this.chatListenerImps && this.chatListenerImps.length !== 0) {
            this.chatListenerImps.forEach(function (value) {
                value.onGetMessagesReaders(dataEvent);
            });
        }
    };
    ;
    return DataListener;
}());
var DataManager = (function () {
    function DataManager() {
        this.orgGroups = {};
        this.projectBaseGroups = {};
        this.privateGroups = {};
        this.privateChats = {};
        this.orgMembers = {};
        this.isOrgMembersReady = false;
    }
    //@ Profile...
    DataManager.prototype.setMyProfile = function (data) {
        this.myProfile = JSON.parse(JSON.stringify(data));
        if (!!this.onMyProfileReady)
            this.onMyProfileReady(this);
    };
    DataManager.prototype.getMyProfile = function () {
        return this.myProfile;
    };
    DataManager.prototype.isMySelf = function (uid) {
        if (uid === this.myProfile._id) {
            return true;
        }
        else {
            return false;
        }
    };
    /**
     * RoomAccess...
     */
    DataManager.prototype.getRoomAccess = function () {
        return this.myProfile.roomAccess;
    };
    DataManager.prototype.setRoomAccessForUser = function (data) {
        if (!!data.roomAccess) {
            this.myProfile.roomAccess = JSON.parse(JSON.stringify(data.roomAccess));
            console.info('set user roomAccess info.');
        }
    };
    DataManager.prototype.updateRoomAccessForUser = function (data) {
        var arr = JSON.parse(JSON.stringify(data.roomAccess));
        this.myProfile.roomAccess.forEach(function (value) {
            if (value.roomId === arr[0].roomId) {
                value.accessTime = arr[0].accessTime;
                return;
            }
        });
    };
    DataManager.prototype.getCompanyInfo = function () {
        return this.companyInfo;
    };
    DataManager.prototype.setCompanyInfo = function (data) {
        this.companyInfo = JSON.parse(JSON.stringify(data));
        if (!!this.onCompanyInfoReady) {
            this.onCompanyInfoReady();
        }
    };
    //<!---------- Group ------------------------------------
    DataManager.prototype.getGroup = function (id) {
        if (!!this.orgGroups[id]) {
            return this.orgGroups[id];
        }
        else if (!!this.projectBaseGroups[id]) {
            return this.projectBaseGroups[id];
        }
        else if (!!this.privateGroups[id]) {
            return this.privateGroups[id];
        }
        else if (!!this.privateChats && !!this.privateChats[id]) {
            return this.privateChats[id];
        }
    };
    DataManager.prototype.addGroup = function (data) {
        switch (data.type) {
            case RoomType.organizationGroup:
                if (!this.orgGroups[data._id]) {
                    this.orgGroups[data._id] = data;
                }
                break;
            case RoomType.projectBaseGroup:
                if (!this.projectBaseGroups[data._id]) {
                    this.projectBaseGroups[data._id] = data;
                }
                break;
            case RoomType.privateGroup:
                if (!this.privateGroups[data._id]) {
                    this.privateGroups[data._id] = data;
                }
                break;
            case RoomType.privateChat:
                if (!this.privateChats) {
                    this.privateChats = {};
                }
                if (!this.privateChats[data._id]) {
                    this.privateChats[data._id] = data;
                }
                break;
            default:
                console.info("new room is not a group type.");
                break;
        }
    };
    DataManager.prototype.updateGroupImage = function (data) {
        if (!!this.orgGroups[data._id]) {
            this.orgGroups[data._id].image = data.image;
        }
        else if (!!this.projectBaseGroups[data._id]) {
            this.projectBaseGroups[data._id].image = data.image;
        }
        else if (!!this.privateGroups[data._id]) {
            this.privateGroups[data._id].image = data.image;
        }
    };
    DataManager.prototype.updateGroupName = function (data) {
        if (!!this.orgGroups[data._id]) {
            this.orgGroups[data._id].name = data.name;
        }
        else if (!!this.projectBaseGroups[data._id]) {
            this.projectBaseGroups[data._id].name = data.name;
        }
        else if (!!this.privateGroups[data._id]) {
            this.privateGroups[data._id].name = data.name;
        }
    };
    DataManager.prototype.updateGroupMembers = function (data) {
        //<!-- Beware please checking myself before update group members.
        //<!-- May be your id is removed from group.
        var hasMe = this.checkMySelfInNewMembersReceived(data);
        if (data.type === RoomType.organizationGroup) {
            if (!!this.orgGroups[data._id]) {
                //<!-- This statement call when current you still a member.
                if (hasMe) {
                    this.orgGroups[data._id].members = data.members;
                }
                else {
                    console.warn("this org group is not contain me in members list.");
                }
            }
            else {
                this.orgGroups[data._id] = data;
            }
        }
        else if (data.type === RoomType.projectBaseGroup) {
            if (!!this.projectBaseGroups[data._id]) {
                if (hasMe) {
                    this.projectBaseGroups[data._id].visibility = true;
                    this.projectBaseGroups[data._id].members = data.members;
                }
                else {
                    this.projectBaseGroups[data._id].visibility = false;
                }
            }
            else {
                this.projectBaseGroups[data._id] = data;
            }
        }
        else if (data.type === RoomType.privateGroup) {
            if (!!this.privateGroups[data._id]) {
                if (hasMe) {
                    this.privateGroups[data._id].visibility = true;
                    this.privateGroups[data._id].members = data.members;
                }
                else {
                    this.privateGroups[data._id].visibility = false;
                }
            }
            else {
                console.debug("new group", data.name);
                this.privateGroups[data._id] = data;
            }
        }
        console.log('dataManager.updateGroupMembers:');
    };
    DataManager.prototype.updateGroupMemberDetail = function (jsonObj) {
        var _this = this;
        var editMember = jsonObj.editMember;
        var roomId = jsonObj.roomId;
        var groupMember = new Member();
        groupMember.id = editMember.id;
        var role = editMember.role;
        groupMember.role = MemberRole[role];
        groupMember.jobPosition = editMember.jobPosition;
        this.getGroup(roomId).members.forEach(function (value, index, arr) {
            if (value.id === groupMember.id) {
                _this.getGroup(roomId).members[index].role = groupMember.role;
                _this.getGroup(roomId).members[index].textRole = MemberRole[groupMember.role];
                _this.getGroup(roomId).members[index].jobPosition = groupMember.jobPosition;
            }
        });
    };
    DataManager.prototype.checkMySelfInNewMembersReceived = function (data) {
        var self = this;
        var hasMe = data.members.some(function isMySelfId(element, index, array) {
            return element.id === self.myProfile._id;
        });
        console.debug("New data has me", hasMe);
        return hasMe;
    };
    //<!------------------------------------------------------
    DataManager.prototype.onUserLogin = function (dataEvent) {
        var jsonObject = JSON.parse(JSON.stringify(dataEvent));
        var _id = jsonObject._id;
        var self = this;
        if (!this.orgMembers)
            this.orgMembers = {};
        if (!this.orgMembers[_id]) {
            //@ Need to get new contact info.
            ChatServer.ServerImplemented.getInstance().getMemberProfile(_id, function (err, res) {
                if (!err) {
                    console.log("getMemberProfile : result", JSON.stringify(res));
                    var datas = JSON.parse(JSON.stringify(res.data));
                    var contact = new ContactInfo();
                    contact._id = datas[0]._id;
                    contact.displayname = datas[0].displayname;
                    contact.image = datas[0].image;
                    contact.status = datas[0].status;
                    self.orgMembers[contact._id] = contact;
                    console.log(contact);
                    if (self.onContactsDataReady != null) {
                        self.onContactsDataReady();
                    }
                    console.log("We need to save contacts list to persistence data layer.");
                }
                else {
                    console.error("getMemberProfile fail.", err);
                }
            });
        }
        else {
            console.log("Online:", this.orgMembers[_id]);
        }
    };
    DataManager.prototype.updateContactImage = function (contactId, url) {
        if (!!this.orgMembers[contactId]) {
            this.orgMembers[contactId].image = url;
        }
    };
    DataManager.prototype.updateContactProfile = function (contactId, params) {
        if (!!this.orgMembers[contactId]) {
            var jsonObj = JSON.parse(JSON.stringify(params));
            if (!!jsonObj.displayname) {
                this.orgMembers[contactId].displayname = jsonObj.displayname;
            }
            if (!!jsonObj.status) {
                this.orgMembers[contactId].status = jsonObj.status;
            }
        }
    };
    DataManager.prototype.getContactProfile = function (contactId) {
        if (!!this.orgMembers[contactId]) {
            return this.orgMembers[contactId];
        }
        else {
            console.warn('this contactId is invalid. Maybe it not contain in list of contacts.');
        }
    };
    DataManager.prototype.onGetMe = function (dataEvent) {
        var self = this;
        var _profile = JSON.parse(JSON.stringify(dataEvent));
        if (dataEvent.code === 200) {
            this.setMyProfile(dataEvent.data);
        }
        else {
            console.error("get use profile fail!", dataEvent.message);
        }
    };
    DataManager.prototype.onGetCompanyInfo = function (dataEvent) {
        var self = this;
        var _company = JSON.parse(JSON.stringify(dataEvent));
        if (dataEvent.code === 200) {
            this.setCompanyInfo(dataEvent.data);
        }
        else {
            console.error("get company info fail!", dataEvent.message);
        }
    };
    DataManager.prototype.onGetCompanyMemberComplete = function (dataEvent) {
        var self = this;
        var members = JSON.parse(JSON.stringify(dataEvent));
        if (!this.orgMembers)
            this.orgMembers = {};
        async.eachSeries(members, function iterator(item, cb) {
            if (!self.orgMembers[item._id]) {
                self.orgMembers[item._id] = item;
            }
            cb();
        }, function done(err) {
            self.isOrgMembersReady = true;
        });
        if (this.onContactsDataReady != null)
            this.onContactsDataReady();
    };
    ;
    DataManager.prototype.onGetOrganizeGroupsComplete = function (dataEvent) {
        var _this = this;
        var rooms = JSON.parse(JSON.stringify(dataEvent));
        if (!this.orgGroups)
            this.orgGroups = {};
        rooms.forEach(function (value) {
            if (!_this.orgGroups[value._id]) {
                _this.orgGroups[value._id] = value;
            }
        });
        if (this.onOrgGroupDataReady != null) {
            this.onOrgGroupDataReady();
        }
    };
    ;
    DataManager.prototype.onGetProjectBaseGroupsComplete = function (dataEvent) {
        var _this = this;
        var groups = JSON.parse(JSON.stringify(dataEvent));
        if (!this.projectBaseGroups)
            this.projectBaseGroups = {};
        groups.forEach(function (value) {
            if (!_this.projectBaseGroups[value._id]) {
                _this.projectBaseGroups[value._id] = value;
            }
        });
        if (this.onProjectBaseGroupsDataReady != null) {
            this.onProjectBaseGroupsDataReady();
        }
    };
    ;
    DataManager.prototype.onGetPrivateGroupsComplete = function (dataEvent) {
        var _this = this;
        var groups = JSON.parse(JSON.stringify(dataEvent));
        if (!this.privateGroups)
            this.privateGroups = {};
        groups.forEach(function (value) {
            if (!_this.privateGroups[value._id]) {
                _this.privateGroups[value._id] = value;
            }
        });
        if (this.onPrivateGroupsDataReady != null) {
            this.onPrivateGroupsDataReady();
        }
    };
    ;
    return DataManager;
}());
var CompanyInfo = (function () {
    function CompanyInfo() {
    }
    return CompanyInfo;
}());
var ContactInfo = (function () {
    function ContactInfo() {
    }
    return ContactInfo;
}());
/**
 * Created by nattapon on 7/17/15 AD.
 */
var ContentType;
(function (ContentType) {
    ContentType[ContentType["Unload"] = 0] = "Unload";
    ContentType[ContentType["File"] = 1] = "File";
    ContentType[ContentType["Text"] = 2] = "Text";
    ContentType[ContentType["Voice"] = 3] = "Voice";
    ContentType[ContentType["Image"] = 4] = "Image";
    ContentType[ContentType["Video"] = 5] = "Video";
    ContentType[ContentType["Sticker"] = 6] = "Sticker";
    ContentType[ContentType["Location"] = 7] = "Location";
})(ContentType || (ContentType = {}));
//<!--- Referrence by http://management.about.com/od/people/a/EEgradelevels.htm
var JobLevel;
(function (JobLevel) {
    JobLevel[JobLevel["employees"] = 0] = "employees";
    JobLevel[JobLevel["junior"] = 1] = "junior";
    JobLevel[JobLevel["senior"] = 2] = "senior";
    JobLevel[JobLevel["directors"] = 3] = "directors";
    JobLevel[JobLevel["vice_president"] = 4] = "vice_president"; //Vice President,
})(JobLevel || (JobLevel = {}));
var Member = (function () {
    function Member() {
        this.role = MemberRole.member;
    }
    return Member;
}());
var MemberRole;
(function (MemberRole) {
    MemberRole[MemberRole["member"] = 0] = "member";
    MemberRole[MemberRole["admin"] = 1] = "admin";
})(MemberRole || (MemberRole = {}));
var MessageMeta = (function () {
    function MessageMeta() {
    }
    return MessageMeta;
}());
var Message = (function () {
    function Message() {
    }
    return Message;
}());
var MinLocation = (function () {
    function MinLocation() {
    }
    return MinLocation;
}());
var RoomType;
(function (RoomType) {
    RoomType[RoomType["organizationGroup"] = 0] = "organizationGroup";
    RoomType[RoomType["projectBaseGroup"] = 1] = "projectBaseGroup";
    RoomType[RoomType["privateGroup"] = 2] = "privateGroup";
    RoomType[RoomType["privateChat"] = 3] = "privateChat";
})(RoomType || (RoomType = {}));
;
var RoomStatus;
(function (RoomStatus) {
    RoomStatus[RoomStatus["active"] = 0] = "active";
    RoomStatus[RoomStatus["disable"] = 1] = "disable";
    RoomStatus[RoomStatus["delete"] = 2] = "delete";
})(RoomStatus || (RoomStatus = {}));
;
var Room = (function () {
    function Room() {
        this._visibility = true;
    }
    Object.defineProperty(Room.prototype, "visibility", {
        set: function (_boo) {
            this._visibility = _boo;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Room.prototype, "visibilty", {
        get: function () {
            return this._visibility;
        },
        enumerable: true,
        configurable: true
    });
    Room.prototype.setName = function (name) {
        this.name = name;
    };
    return Room;
}());
var RoomAccessData = (function () {
    function RoomAccessData() {
    }
    return RoomAccessData;
}());
;
var TokenDecode = (function () {
    function TokenDecode() {
    }
    return TokenDecode;
}());
var User = (function () {
    function User() {
    }
    return User;
}());
var UserRole;
(function (UserRole) {
    UserRole[UserRole["personnel"] = 0] = "personnel";
    UserRole[UserRole["section_chief"] = 1] = "section_chief";
    UserRole[UserRole["department_chief"] = 2] = "department_chief";
    UserRole[UserRole["division_chief"] = 3] = "division_chief";
    UserRole[UserRole["admin"] = 4] = "admin";
})(UserRole || (UserRole = {}));
;
var Main = (function () {
    function Main() {
    }
    Main.getInstance = function () {
        if (this.instance === null || this.instance === undefined) {
            this.instance = Main.prototype;
        }
        return this.instance;
    };
    Main.prototype.getMessageDAL = function () {
        return this.messageReducer;
    };
    Main.prototype.setMessageReducer = function (store) {
        this.messageReducer = store;
    };
    Main.prototype.setAuthReducer = function (store) {
        this.authenReducer = store;
    };
    Main.prototype.setRoomDAL = function (dal) {
        this.roomDAL = dal;
    };
    Main.prototype.clearRoomDAL = function () {
        this.roomDAL.clearData(function (err) {
            console.error(err);
        });
    };
    Main.prototype.clearMessageReducer = function () {
        this.messageReducer.clearData(function (err) {
            console.error(err);
        });
    };
    Main.prototype.clearAuthReducer = function () {
        this.authenReducer.clearData(function (err) {
            console.error(err);
        });
    };
    Main.prototype.clearAllData = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            localStorage.clear();
            _this.clearAuthReducer();
            _this.clearRoomDAL();
            _this.clearMessageReducer();
            resolve();
        });
    };
    Main.prototype.getDataManager = function () {
        return this.dataManager;
    };
    Main.prototype.setDataManager = function (data) {
        this.dataManager = data;
        this.dataListener = new DataListener(this.dataManager);
    };
    Main.prototype.getDataListener = function () {
        return this.dataListener;
    };
    Main.prototype.getServerImp = function () {
        //console.log("getServerImp", this.serverImp);
        return this.serverImp;
    };
    Main.prototype.setServerImp = function (server) {
        this.serverImp = server;
        //console.log("setServerImp", server);
    };
    Main.prototype.getChatRoomApi = function () {
        if (!this.chatRoomApi) {
            this.chatRoomApi = ChatServer.ChatRoomApiProvider.prototype;
        }
        return this.chatRoomApi;
    };
    Main.prototype.setServerListener = function (server) {
        this.serverListener = server;
    };
    Main.prototype.startChatServerListener = function (resolve, rejected) {
        this.serverListener.addFrontendListener(this.dataManager);
        this.serverListener.addServerListener(this.dataListener);
        this.serverListener.addChatListener(this.dataListener);
        this.serverListener.addListenner(resolve, rejected);
    };
    Main.prototype.getHashService = function (content, callback) {
        var hashService = new SecureService();
        hashService.hashCompute(content, callback);
    };
    Main.prototype.encodeService = function (content, callback) {
        var crypto = new SecureService();
        crypto.encryptWithSecureRandom(content, callback);
    };
    Main.prototype.decodeService = function (content, callback) {
        var crypto = new SecureService();
        crypto.decryptWithSecureRandom(content, callback);
    };
    Main.prototype.authenUser = function (server, email, password, deviceToken, callback) {
        console.log("authenUser:", email);
        var self = this;
        server.logIn(email, password, deviceToken, function (err, loginRes) {
            callback(err, loginRes);
            if (!err && loginRes !== null && loginRes.code === HttpStatusCode.success) {
                //<!-- Listen all event in the spartan world.
                self.authenReducer.saveData({ uid: loginRes.uid, sessionToken: loginRes.token });
                server.authenData.userId = loginRes.uid;
                server.authenData.token = loginRes.token;
                new Promise(function callback(resolve, rejected) {
                    self.startChatServerListener(resolve, rejected);
                }).then(function onFulfilled(value) {
                    server.getMe(function (err, res) {
                        if (err || res === null) {
                            console.error(err);
                        }
                        else {
                            self.dataManager.onMyProfileReady = self.onMyProfileReadyListener;
                            if (res.code === HttpStatusCode.success) {
                            }
                            else {
                                console.warn("My user profile is empty. please check.");
                            }
                        }
                    });
                    server.getCompanyInfo(function (err, res) {
                        if (err || res === null) {
                            console.error(err);
                        }
                        else {
                            console.log("get companyInfo: ", JSON.stringify(res.code));
                        }
                    });
                    server.getOrganizationGroups(function (err, res) {
                        if (err || res === null) {
                            console.error(err);
                        }
                        else {
                            console.log("organize groups: ", JSON.stringify(res));
                        }
                    });
                    server.getProjectBaseGroups(function (err, res) {
                        if (err || res === null) {
                            console.error(err);
                        }
                        else {
                            console.log("project base groups: ", JSON.stringify(res));
                        }
                    });
                    server.getPrivateGroups(function (err, res) {
                        if (err || res === null) {
                            console.error(err);
                        }
                        else {
                            console.log("Private groups: ", JSON.stringify(res));
                        }
                    });
                    server.getCompanyMembers(function (err, res) {
                        if (err || res === null) {
                            console.error(err);
                        }
                        else {
                            console.log("Company Members: ", JSON.stringify(res));
                        }
                    });
                }).catch(function onRejected(err) {
                    console.error(err);
                });
            }
            else {
                console.warn(err, JSON.stringify(loginRes));
            }
        });
    };
    return Main;
}());
var NotifyManager = (function () {
    function NotifyManager(main) {
        console.log("NotifyManager.constructor");
        this.dataManager = main.getDataManager();
        this.serverImp = main.getServerImp();
    }
    NotifyManager.prototype.notify = function (chatMessageImp, appBackground, notifyService) {
        var self = this;
        var contactName, contactId;
        if (this.dataManager.getGroup(chatMessageImp.rid) === undefined) {
            contactName = this.dataManager.getContactProfile(chatMessageImp.sender).displayname;
            contactId = this.dataManager.getContactProfile(chatMessageImp.sender)._id;
        }
        else {
            contactName = this.dataManager.getGroup(chatMessageImp.rid).name;
            contactId = this.dataManager.getGroup(chatMessageImp.rid)._id;
        }
        if (chatMessageImp.type.toString() === ContentType[ContentType.Text]) {
            var secure = new SecureService();
            if (self.serverImp.appConfig.encryption == true) {
                secure.decryptWithSecureRandom(chatMessageImp.body, function done(err, res) {
                    if (!err) {
                        chatMessageImp.body = res;
                    }
                    else {
                        console.warn(err, res);
                    }
                    var toastMessage = contactName + " sent " + chatMessageImp.body;
                    if (!appBackground) {
                        notifyService.makeToastOnCenter(contactId, toastMessage);
                    }
                    else {
                        notifyService.scheduleSingleNotification(contactId, contactName, chatMessageImp.body);
                    }
                });
            }
            else {
                var toastMessage = contactName + " sent " + chatMessageImp.body;
                if (!appBackground) {
                    notifyService.makeToastOnCenter(contactId, toastMessage);
                }
                else {
                    notifyService.scheduleSingleNotification(contactId, contactName, chatMessageImp.body);
                }
            }
        }
        else if (chatMessageImp.type.toString() === ContentType[ContentType.Sticker]) {
            var message = contactName + " sent a sticker.";
            if (!appBackground) {
                notifyService.makeToastOnCenter(contactId, message);
            }
            else {
                notifyService.scheduleSingleNotification(contactId, contactName, message);
            }
        }
        else if (chatMessageImp.type.toString() === ContentType[ContentType.Voice]) {
            var message = contactName + " sent a voice message.";
            if (!appBackground) {
                notifyService.makeToastOnCenter(contactId, message);
            }
            else {
                notifyService.scheduleSingleNotification(contactId, contactName, message);
            }
        }
        else if (chatMessageImp.type.toString() === ContentType[ContentType.Image]) {
            var message = contactName + " sent a image.";
            if (!appBackground) {
                notifyService.makeToastOnCenter(contactId, message);
            }
            else {
                notifyService.scheduleSingleNotification(contactId, contactName, message);
            }
        }
        else if (chatMessageImp.type.toString() === ContentType[ContentType.Video]) {
            var message = contactName + " sent a video.";
            if (!appBackground) {
                notifyService.makeToastOnCenter(contactId, message);
            }
            else {
                notifyService.scheduleSingleNotification(contactId, contactName, message);
            }
        }
        else if (chatMessageImp.type.toString() === ContentType[ContentType.Location]) {
            var message = contactName + " sent a location.";
            if (!appBackground) {
                notifyService.makeToastOnCenter(contactId, message);
            }
            else {
                notifyService.scheduleSingleNotification(contactId, contactName, message);
            }
        }
    };
    return NotifyManager;
}());
var CryptoJS; //= require("../lib/crypto-js/index");
var SecureService = (function () {
    function SecureService() {
        this.key = "CHITCHAT!@#$%^&*()_+|===";
        this.passiv = "ThisIsUrPassword";
    }
    SecureService.prototype.hashCompute = function (content, callback) {
        var hash = CryptoJS.MD5(content);
        var md = hash.toString(CryptoJS.enc.Hex);
        callback(null, md);
        // require(["../lib/crypto-js/crypto-js"], function (CryptoJS) {
        //     var hash = CryptoJS.MD5(content);
        //     var md = hash.toString(CryptoJS.enc.Hex);
        //     callback(null, md);
        // });
    };
    SecureService.prototype.encryption = function (content, callback) {
        var self = this;
        var ciphertext = CryptoJS.AES.encrypt(content, self.key);
        callback(null, ciphertext.toString());
        // require([], function (CryptoJS) {
        //     var ciphertext = CryptoJS.AES.encrypt(content, self.key);
        //     callback(null, ciphertext.toString());
        // });
    };
    SecureService.prototype.decryption = function (content, callback) {
        var self = this;
        var bytes = CryptoJS.AES.decrypt(content, self.key);
        var plaintext = bytes.toString(CryptoJS.enc.Utf8);
        callback(null, plaintext);
        /*
                require(["../lib/crypto-js/crypto-js"], function (CryptoJS) {
                    //   var words = CryptoJS.enc.Base64.parse(content);
                    var bytes = CryptoJS.AES.decrypt(content, self.key);
                    var plaintext = bytes.toString(CryptoJS.enc.Utf8);
                    callback(null, plaintext);
                });
                */
    };
    SecureService.prototype.encryptWithSecureRandom = function (content, callback) {
        var self = this;
        var key = CryptoJS.enc.Utf8.parse(self.key);
        var iv = CryptoJS.enc.Utf8.parse(self.passiv);
        var ciphertext = CryptoJS.AES.encrypt(content, key, { iv: iv });
        callback(null, ciphertext.toString());
        /*
        require(["../lib/crypto-js/crypto-js"], function (CryptoJS) {
            var key = CryptoJS.enc.Utf8.parse(self.key);
            var iv = CryptoJS.enc.Utf8.parse(self.passiv);
            var ciphertext = CryptoJS.AES.encrypt(content, key, { iv: iv });

            callback(null, ciphertext.toString());
        });
        */
    };
    SecureService.prototype.decryptWithSecureRandom = function (content, callback) {
        var self = this;
        var key = CryptoJS.enc.Utf8.parse(self.key);
        var iv = CryptoJS.enc.Utf8.parse(self.passiv);
        var bytes = CryptoJS.AES.decrypt(content, key, { iv: iv, padding: CryptoJS.pad.Pkcs7, mode: CryptoJS.mode.CBC });
        var plaintext;
        try {
            plaintext = bytes.toString(CryptoJS.enc.Utf8);
        }
        catch (e) {
            console.warn(e);
        }
        if (!!plaintext)
            callback(null, plaintext);
        else
            callback(new Error("cannot decrypt content"), content);
        /*
        require(["../lib/crypto-js/crypto-js"], function (CryptoJS) {
            var key = CryptoJS.enc.Utf8.parse(self.key);
            var iv = CryptoJS.enc.Utf8.parse(self.passiv);
            var bytes = CryptoJS.AES.decrypt(content, key, { iv: iv, padding: CryptoJS.pad.Pkcs7, mode: CryptoJS.mode.CBC });
            var plaintext;
            try {
                plaintext = bytes.toString(CryptoJS.enc.Utf8);
            }
            catch (e) {
                console.warn(e);
            }

            if (!!plaintext)
                callback(null, plaintext);
            else
                callback(new Error("cannot decrypt content"), content);
        });
        */
    };
    return SecureService;
}());
var Dummy = (function () {
    function Dummy() {
        this.chatRoom = ChatServer.ChatRoomApiProvider.prototype;
        this.bots = [{ name: "test1@rfl.com", pass: "1234" }, { name: "test2@rfl.com", pass: "1234" },
            { name: "test3@rfl.com", pass: "1234" }, { name: "test4@rfl.com", pass: "1234" }, { name: "test5@rfl.com", pass: "1234" },
            { name: "test6@rfl.com", pass: "1234" }, { name: "test7@rfl.com", pass: "1234" }];
        this.serverApi = ChatServer.ServerImplemented.getInstance();
    }
    Dummy.prototype.getBot = function () {
        var r = Math.floor((Math.random() * this.bots.length) + 1);
        return this.bots[r];
    };
    Dummy.prototype.fireChatInRoom = function (myUid) {
        var _this = this;
        this.serverApi.JoinChatRoomRequest("55d5bb67451bbf090b0e8cde", function (err, res) {
            if (!err && res !== null) {
                setInterval(function () {
                    _this.chatRoom.chat("55d5bb67451bbf090b0e8cde", "bot", myUid, "test for bot", ContentType[ContentType.Text], function (err, res) {
                        console.log(res);
                    });
                }, 1000);
            }
        });
    };
    return Dummy;
}());
/*
{
    "_id" : ObjectId("55d5bb67451bbf090b0e8cde"),
    "name" : "SkylineDeveloper",
    "type" : 2,
    "members" : [
        {
            "id" : "55d1929fd20212707c46c688"
        }
    ],
    "createTime" : ISODate("2015-08-20T11:35:03.066Z"),
    "image" : "/uploads/groups/images/4b8560d8b445d3c48a0b076b1b4c8139.jpg"
}
*/ 
/**
 * ngControllerUtil
 */
var ngControllerUtil = (function () {
    function ngControllerUtil(parameters) {
    }
    return ngControllerUtil;
}());
ngControllerUtil.viewProfileController = "viewProfileController";
ngControllerUtil.groupDetailCtrl = "groupDetailCtrl";
ngControllerUtil.editMemberGroup = 'editMemberGroup';
var NGStateUtil = (function () {
    function NGStateUtil() {
    }
    return NGStateUtil;
}());
NGStateUtil.tab_login = 'tab.login';
NGStateUtil.tab_login_error = 'tab.login-error';
NGStateUtil.tab_group = 'tab.group';
NGStateUtil.tab_group_viewprofile = 'tab.group-viewprofile';
NGStateUtil.tab_group_members = 'tab.group-members';
NGStateUtil.tab_group_members_invite = 'tab.group-members-invite';
NGStateUtil.tab_group_members_edit = 'tab.group-members-edit';
NGStateUtil.tab_group_chat = 'tab.group-chat';
NGStateUtil.tab_group_freecall = 'tab.group-freecall';
NGStateUtil.tab_chats = 'tab.chats';
NGStateUtil.tab_chats_chat = 'tab.chats-chat';
NGStateUtil.tab_chats_chat_viewprofile = 'tab.chats-chat-viewprofile';
NGStateUtil.tab_chats_chat_members = 'tab.chats-chat-members';
NGStateUtil.tab_chats_chat_members_invite = 'tab.chats-chat-members-invite';
var CallState;
(function (CallState) {
    CallState[CallState["idle"] = 0] = "idle";
    CallState[CallState["signalingCall"] = 1] = "signalingCall";
    CallState[CallState["calling"] = 2] = "calling";
})(CallState || (CallState = {}));
;
var WebRtcCallState = (function () {
    function WebRtcCallState() {
    }
    return WebRtcCallState;
}());
var WebRtcComponent = (function () {
    function WebRtcComponent() {
        console.log("starting.. webRtcComponent.");
        this.webRtcCallState = new WebRtcCallState();
    }
    WebRtcComponent.prototype.setCallState = function (state) {
        this.webRtcCallState.callState = state;
    };
    WebRtcComponent.prototype.onVideoCall = function (dataEvent) {
        var body = dataEvent.body;
        var contactId = body.from;
        var peerId = body.peerId;
        if (this.webRtcCallState.callState === CallState.idle) {
            if (this.videoCallEvent != null) {
                this.videoCallEvent(contactId, peerId);
            }
        }
        else {
            console.warn("Call status is not idle. " + this.webRtcCallState.callState.toString());
            if (this.lineBusyEvent != null) {
                this.lineBusyEvent(contactId);
            }
        }
    };
    WebRtcComponent.prototype.onVoiceCall = function (dataEvent) {
        var body = dataEvent.body;
        var contactId = body.from;
        var peerId = body.peerId;
        if (this.webRtcCallState.callState === CallState.idle) {
            if (this.voiceCallEvent != null) {
                this.voiceCallEvent(contactId, peerId);
            }
        }
        else {
            console.warn("Call status is not idle. " + this.webRtcCallState.callState.toString());
            if (this.lineBusyEvent != null) {
                this.lineBusyEvent(contactId);
            }
        }
    };
    WebRtcComponent.prototype.onHangupCall = function (dataEvent) {
        if (this.hangUpCallEvent != null) {
            this.hangUpCallEvent();
        }
    };
    WebRtcComponent.prototype.onTheLineIsBusy = function (dataEvent) {
        if (this.contactLineBusyEvent != null) {
            this.contactLineBusyEvent();
        }
    };
    return WebRtcComponent;
}());
// For an introduction to the Blank template, see the following documentation:
// http://go.microsoft.com/fwlink/?LinkID=397705
// To debug code on page load in Ripple or on Android devices/emulators: launch your app, set breakpoints, 
// and then run "window.location.reload()" in the JavaScript Console.
var BlankCordovaApp1;
(function (BlankCordovaApp1) {
    "use strict";
    var Application;
    (function (Application) {
        function initialize() {
            document.addEventListener('deviceready', onDeviceReady, false);
        }
        Application.initialize = initialize;
        function onDeviceReady() {
            // Handle the Cordova pause and resume events
            document.addEventListener('pause', onPause, false);
            document.addEventListener('resume', onResume, false);
            // TODO: Cordova has been loaded. Perform any initialization that requires Cordova here.
            console.warn("onDeviceReady");
        }
        function onPause() {
            // TODO: This application has been suspended. Save application state here.
            console.warn('onPause');
        }
        function onResume() {
            // TODO: This application has been reactivated. Restore application state here.
            console.warn('onResume');
        }
    })(Application = BlankCordovaApp1.Application || (BlankCordovaApp1.Application = {}));
    window.onload = function () {
        Application.initialize();
    };
})(BlankCordovaApp1 || (BlankCordovaApp1 = {}));
var config;
var pomelo;
var username = "";
var password = "";
var ChatServer;
(function (ChatServer) {
    var AuthenData = (function () {
        function AuthenData() {
        }
        return AuthenData;
    }());
    var ServerImplemented = (function () {
        function ServerImplemented() {
            this._isConnected = false;
            this._isLogedin = false;
            console.warn("serv imp. constructor");
        }
        ServerImplemented.getInstance = function () {
            if (this.Instance === null || this.Instance === undefined) {
                this.Instance = new ServerImplemented();
            }
            return this.Instance;
        };
        ServerImplemented.prototype.setSocketComponent = function (socket) {
            this.socketComponent = socket;
        };
        ServerImplemented.prototype.getClient = function () {
            var self = this;
            if (pomelo !== null) {
                return pomelo;
            }
            else {
                console.warn("disconnect Event");
            }
        };
        ServerImplemented.prototype.dispose = function () {
            console.warn("dispose socket client.");
            this.disConnect();
            this.authenData = null;
        };
        ServerImplemented.prototype.disConnect = function () {
            console.log('disconnecting...');
            if (!!pomelo) {
                pomelo.removeAllListeners();
                pomelo.disconnect();
                pomelo = null;
            }
        };
        ServerImplemented.prototype.logout = function (registrationId) {
            var msg = {};
            msg["username"] = username;
            msg["registrationId"] = registrationId;
            if (pomelo != null)
                pomelo.notify("connector.entryHandler.logout", msg);
            this.disConnect();
        };
        ServerImplemented.prototype.init = function (callback) {
            console.log('serverImp.init()');
            var self = this;
            this._isConnected = false;
            this.authenData = new AuthenData();
            var pro = new Promise(function (resolve, rejected) {
                self.loadSocket(resolve, rejected);
            }).then(function onfulfilled(value) {
                self.loadConfig(callback);
            }).catch(function onRejected(err) {
                console.error(err);
            });
        };
        ServerImplemented.prototype.loadSocket = function (resolve, rejected) {
            try {
                pomelo = require("./js/pomelo/pomeloclient");
                resolve(pomelo);
            }
            catch (e) {
                require(["../js/pomelo-web/pomelo"], function (value) {
                    pomelo = value;
                    resolve(pomelo);
                });
            }
        };
        ServerImplemented.prototype.loadConfig = function (callback) {
            var _this = this;
            this.appConfig = JSON.parse(config);
            this.host = this.appConfig.socketHost;
            this.port = this.appConfig.socketPort;
            if (!!pomelo) {
                //<!-- Connecting gate server.
                this.connectServer(this.host, this.port, function (err) {
                    callback(err, _this);
                });
            }
            else {
                console.error("pomelo socket is un ready.");
            }
        };
        ServerImplemented.prototype.connectServer = function (_host, _port, callback) {
            console.log("socket connecting to: ", _host, _port);
            // var self = this;    
            pomelo.init({ host: _host, port: _port }, function cb(err) {
                console.log("socket init result: " + err);
                callback(err);
            });
        };
        ServerImplemented.prototype.connectToConnectorServer = function (callback) {
        };
        // region <!-- Authentication...
        /// <summary>
        /// Connect to gate server then get query of connector server.
        /// </summary>
        ServerImplemented.prototype.logIn = function (_username, _hash, registrationId, callback) {
            var self = this;
            username = _username;
            password = _hash;
            if (pomelo !== null && this._isConnected === false) {
                var msg = { uid: username };
                //<!-- Quering connector server.
                pomelo.request("gate.gateHandler.queryEntry", msg, function (result) {
                    console.log("QueryConnectorServ", result.code);
                    if (result.code === HttpStatusCode.success) {
                        self.disConnect();
                        var promiseLoadSocket = new Promise(function (resolve, reject) {
                            self.loadSocket(resolve, reject);
                        });
                        promiseLoadSocket.then(function (value) {
                            var connectorPort = result.port;
                            //<!-- Connecting to connector server.
                            self.connectServer(self.host, connectorPort, function (err) {
                                self._isConnected = true;
                                if (!!err) {
                                    callback(err, null);
                                }
                                else {
                                    self.authenForFrontendServer(registrationId, callback);
                                }
                            });
                        }).catch(function (error) {
                            console.error('Load socket fail!');
                        });
                    }
                });
            }
            else if (pomelo !== null && this._isConnected) {
                self.authenForFrontendServer(registrationId, callback);
            }
        };
        //<!-- Authentication. request for token sign.
        ServerImplemented.prototype.authenForFrontendServer = function (registrationId, callback) {
            var self = this;
            var msg = { username: username, password: password, registrationId: registrationId };
            //<!-- Authentication.
            pomelo.request("connector.entryHandler.login", msg, function (res) {
                console.log("login response: ", JSON.stringify(res));
                if (res.code === HttpStatusCode.fail) {
                    if (callback != null) {
                        callback(res.message, res);
                    }
                }
                else if (res.code === HttpStatusCode.success) {
                    if (callback != null) {
                        callback(null, res);
                    }
                    pomelo.on('disconnect', function data(reason) {
                        self._isConnected = false;
                        if (self.socketComponent !== null)
                            self.socketComponent.disconnected(reason);
                    });
                }
                else {
                    if (callback !== null) {
                        callback(null, res);
                    }
                }
            });
        };
        ServerImplemented.prototype.TokenAuthen = function (tokenBearer, checkTokenCallback) {
            var _this = this;
            var msg = {};
            msg["token"] = tokenBearer;
            pomelo.request("gate.gateHandler.authenGateway", msg, function (result) {
                _this.OnTokenAuthenticate(result, checkTokenCallback);
            });
        };
        ServerImplemented.prototype.OnTokenAuthenticate = function (tokenRes, onSuccessCheckToken) {
            if (tokenRes.code === 200) {
                var data = tokenRes.data;
                var decode = data.decoded; //["decoded"];
                var decodedModel = JSON.parse(JSON.stringify(decode));
                if (onSuccessCheckToken != null)
                    onSuccessCheckToken(null, { success: true, username: decodedModel.username, password: decodedModel.password });
            }
            else {
                if (onSuccessCheckToken != null) {
                    onSuccessCheckToken(tokenRes.message, null);
                }
            }
        };
        ServerImplemented.prototype.kickMeAllSession = function (uid) {
            if (pomelo !== null) {
                var msg = { uid: uid };
                pomelo.request("connector.entryHandler.kickMe", msg, function (result) {
                    console.log("kickMe", JSON.stringify(result));
                });
            }
            else {
                console.error("Cannot kick session.");
            }
        };
        //<@--- ServerAPIProvider.
        //region <!-- user profile -->
        ServerImplemented.prototype.UpdateUserProfile = function (myId, profileFields, callback) {
            profileFields["token"] = this.authenData.token;
            profileFields["_id"] = myId;
            pomelo.request("auth.profileHandler.profileUpdate", profileFields, function (result) {
                if (callback != null) {
                    callback(null, result);
                }
            });
        };
        ServerImplemented.prototype.ProfileImageChanged = function (userId, path, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["userId"] = userId;
            msg["path"] = path;
            pomelo.request("auth.profileHandler.profileImageChanged", msg, function (result) {
                if (callback != null) {
                    callback(null, result);
                }
            });
        };
        ServerImplemented.prototype.getLastAccessRoomsInfo = function (sessionToken, callback) {
            if (sessionToken === void 0) { sessionToken = ""; }
            var msg = {};
            msg["token"] = sessionToken;
            //<!-- Get user info.
            pomelo.request("connector.entryHandler.getLastAccessRooms", msg, function (result) {
                if (callback !== null) {
                    callback(null, result);
                }
            });
        };
        ServerImplemented.prototype.getMe = function (callback) {
            var msg = {};
            msg["username"] = username;
            msg["password"] = password;
            msg["token"] = this.authenData.token;
            //<!-- Get user info.
            pomelo.request("connector.entryHandler.getMe", msg, function (result) {
                console.log("getMe: ", JSON.stringify(result.code));
                if (callback !== null) {
                    callback(null, result);
                }
            });
        };
        ServerImplemented.prototype.updateFavoriteMember = function (editType, member, callback) {
            var msg = {};
            msg["editType"] = editType;
            msg["member"] = member;
            msg["token"] = this.authenData.token;
            //<!-- Get user info.
            pomelo.request("auth.profileHandler.editFavoriteMembers", msg, function (result) {
                console.log("updateFavoriteMember: ", JSON.stringify(result));
                callback(null, result);
            });
        };
        ServerImplemented.prototype.updateFavoriteGroups = function (editType, group, callback) {
            var msg = {};
            msg["editType"] = editType;
            msg["group"] = group;
            msg["token"] = this.authenData.token;
            //<!-- Get user info.
            pomelo.request("auth.profileHandler.updateFavoriteGroups", msg, function (result) {
                console.log("updateFavoriteGroups: ", JSON.stringify(result));
                callback(null, result);
            });
        };
        ServerImplemented.prototype.updateClosedNoticeMemberList = function (editType, member, callback) {
            var msg = {};
            msg["editType"] = editType;
            msg["member"] = member;
            msg["token"] = this.authenData.token;
            //<!-- Get user info.
            pomelo.request("auth.profileHandler.updateClosedNoticeUsers", msg, function (result) {
                console.log("updateClosedNoticeUsers: ", JSON.stringify(result));
                callback(null, result);
            });
        };
        ServerImplemented.prototype.updateClosedNoticeGroupsList = function (editType, group, callback) {
            var msg = {};
            msg["editType"] = editType;
            msg["group"] = group;
            msg["token"] = this.authenData.token;
            //<!-- Get user info.
            pomelo.request("auth.profileHandler.updateClosedNoticeGroups", msg, function (result) {
                console.log("updateClosedNoticeGroups: ", JSON.stringify(result));
                callback(null, result);
            });
        };
        ServerImplemented.prototype.getMemberProfile = function (userId, callback) {
            var msg = {};
            msg["userId"] = userId;
            pomelo.request("auth.profileHandler.getMemberProfile", msg, function (result) {
                if (callback != null) {
                    callback(null, result);
                }
            });
        };
        //endregion
        //region  Company data. 
        /// <summary>
        /// Gets the company info.
        /// Beware for data loading so mush. please load from cache before load from server.
        /// </summary>
        ServerImplemented.prototype.getCompanyInfo = function (callBack) {
            var msg = {};
            msg["token"] = this.authenData.token;
            pomelo.request("connector.entryHandler.getCompanyInfo", msg, function (result) {
                if (callBack != null)
                    callBack(null, result);
            });
        };
        /// <summary>
        /// Gets the company members.
        /// Beware for data loading so mush. please load from cache before load from server.
        /// </summary>
        ServerImplemented.prototype.getCompanyMembers = function (callBack) {
            var msg = {};
            msg["token"] = this.authenData.token;
            pomelo.request("connector.entryHandler.getCompanyMember", msg, function (result) {
                console.log("getCompanyMembers", JSON.stringify(result));
                if (callBack != null)
                    callBack(null, result);
            });
        };
        /// <summary>
        /// Gets the company chat rooms.
        /// Beware for data loading so mush. please load from cache before load from server.
        /// </summary>
        ServerImplemented.prototype.getOrganizationGroups = function (callBack) {
            var msg = {};
            msg["token"] = this.authenData.token;
            pomelo.request("connector.entryHandler.getCompanyChatRoom", msg, function (result) {
                console.log("getOrganizationGroups: " + JSON.stringify(result));
                if (callBack != null)
                    callBack(null, result);
            });
        };
        //endregion
        //region Project base.
        ServerImplemented.prototype.getProjectBaseGroups = function (callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            pomelo.request("connector.entryHandler.getProjectBaseGroups", msg, function (result) {
                console.log("getProjectBaseGroups: " + JSON.stringify(result));
                if (callback != null)
                    callback(null, result);
            });
        };
        ServerImplemented.prototype.requestCreateProjectBaseGroup = function (groupName, members, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["groupName"] = groupName;
            msg["members"] = JSON.stringify(members);
            pomelo.request("chat.chatRoomHandler.requestCreateProjectBase", msg, function (result) {
                console.log("requestCreateProjectBaseGroup: " + JSON.stringify(result));
                if (callback != null)
                    callback(null, result);
            });
        };
        ServerImplemented.prototype.editMemberInfoInProjectBase = function (roomId, roomType, member, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["roomId"] = roomId;
            msg["roomType"] = roomType.toString();
            msg["member"] = JSON.stringify(member);
            pomelo.request("chat.chatRoomHandler.editMemberInfoInProjectBase", msg, function (result) {
                if (callback != null)
                    callback(null, result);
            });
        };
        //endregion
        //region <!-- Private Group Room... -->
        ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
        /// <summary>
        /// Gets the public group chat rooms.
        /// Beware for data loading so mush. please load from cache before load from server.
        /// </summary>
        /// <param name="callback">Callback.</param>
        ServerImplemented.prototype.getPrivateGroups = function (callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            pomelo.request("connector.entryHandler.getMyPrivateGroupChat", msg, function (result) {
                console.log("getPrivateGroups: " + JSON.stringify(result));
                if (callback != null) {
                    callback(null, result);
                }
            });
        };
        ServerImplemented.prototype.UserRequestCreateGroupChat = function (groupName, memberIds, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["groupName"] = groupName;
            msg["memberIds"] = JSON.stringify(memberIds);
            pomelo.request("chat.chatRoomHandler.userCreateGroupChat", msg, function (result) {
                console.log("RequestCreateGroupChat", JSON.stringify(result));
                if (callback != null)
                    callback(null, result);
            });
        };
        ServerImplemented.prototype.UpdatedGroupImage = function (groupId, path, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["groupId"] = groupId;
            msg["path"] = path;
            pomelo.request("chat.chatRoomHandler.updateGroupImage", msg, function (result) {
                console.log("UpdatedGroupImage", JSON.stringify(result));
                if (callback != null) {
                    callback(null, result);
                }
            });
        };
        ServerImplemented.prototype.editGroupMembers = function (editType, roomId, roomType, members, callback) {
            if (editType == null || editType.length === 0)
                return;
            if (roomId == null || roomId.length === 0)
                return;
            if (roomType === null)
                return;
            if (members == null || members.length === 0)
                return;
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["editType"] = editType;
            msg["roomId"] = roomId;
            msg["roomType"] = roomType.toString();
            msg["members"] = JSON.stringify(members);
            pomelo.request("chat.chatRoomHandler.editGroupMembers", msg, function (result) {
                console.log("editGroupMembers response." + result.toString());
                if (callback != null) {
                    callback(null, result);
                }
            });
        };
        ServerImplemented.prototype.editGroupName = function (roomId, roomType, newGroupName, callback) {
            if (roomId == null || roomId.length === 0)
                return;
            if (roomType === null)
                return;
            if (newGroupName == null || newGroupName.length === 0)
                return;
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["roomId"] = roomId;
            msg["roomType"] = roomType.toString();
            msg["newGroupName"] = newGroupName;
            pomelo.request("chat.chatRoomHandler.editGroupName", msg, function (result) {
                console.log("editGroupName response." + result.toString());
                if (callback != null) {
                    callback(null, result);
                }
            });
        };
        /// <summary>
        /// Gets Private Chat Room.
        /// </summary>
        /// <param name="myId">My identifier.</param>
        /// <param name="myRoommateId">My roommate identifier.</param>
        ServerImplemented.prototype.getPrivateChatRoomId = function (myId, myRoommateId, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["ownerId"] = myId;
            msg["roommateId"] = myRoommateId;
            pomelo.request("chat.chatRoomHandler.getRoomById", msg, function (result) {
                if (callback != null) {
                    callback(null, result);
                }
            });
        };
        //<!-- Join and leave chat room.
        ServerImplemented.prototype.JoinChatRoomRequest = function (room_id, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["rid"] = room_id;
            msg["username"] = username;
            pomelo.request("connector.entryHandler.enterRoom", msg, function (result) {
                console.log("JoinChatRoom: " + JSON.stringify(result));
                if (callback !== null) {
                    callback(null, result);
                }
            });
        };
        ServerImplemented.prototype.LeaveChatRoomRequest = function (roomId, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["rid"] = roomId;
            msg["username"] = username;
            pomelo.request("connector.entryHandler.leaveRoom", msg, function (result) {
                if (callback != null)
                    callback(null, result);
            });
        };
        /// <summary>
        /// Gets the room info. For load Room info by room_id.
        /// </summary>
        /// <c> return data</c>
        ServerImplemented.prototype.getRoomInfo = function (roomId, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["roomId"] = roomId;
            pomelo.request("chat.chatRoomHandler.getRoomInfo", msg, function (result) {
                console.log("chat.chatRoomHandler.getRoomInfo", result);
                if (callback != null)
                    callback(null, result);
            });
        };
        ServerImplemented.prototype.getUnreadMsgOfRoom = function (roomId, lastAccessTime, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["roomId"] = roomId;
            msg["lastAccessTime"] = lastAccessTime;
            pomelo.request("chat.chatRoomHandler.getUnreadRoomMessage", msg, function (result) {
                console.log("chat.chatRoomHandler.getUnreadRoomMessage", result);
                if (callback != null) {
                    callback(null, result);
                }
            });
        };
        //endregion
        // region <!-- Web RTC Calling...
        ///////////////////////////////////////////////////////////////////////////////////////////////////////////
        /// <summary>
        /// Videos the call requesting.
        /// - tell target client for your call requesting...
        /// </summary>
        ServerImplemented.prototype.videoCallRequest = function (targetId, myRtcId, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["targetId"] = targetId;
            msg["myRtcId"] = myRtcId;
            pomelo.request("connector.entryHandler.videoCallRequest", msg, function (result) {
                console.log("videoCallRequesting =>: " + JSON.stringify(result));
                if (callback != null)
                    callback(null, result);
            });
        };
        ServerImplemented.prototype.voiceCallRequest = function (targetId, myRtcId, callback) {
            var msg = {};
            msg["token"] = this.authenData.token;
            msg["targetId"] = targetId;
            msg["myRtcId"] = myRtcId;
            pomelo.request("connector.entryHandler.voiceCallRequest", msg, function (result) {
                console.log("voiceCallRequesting =>: " + JSON.stringify(result));
                if (callback != null)
                    callback(null, result);
            });
        };
        ServerImplemented.prototype.hangupCall = function (myId, contactId) {
            var msg = {};
            msg["userId"] = myId;
            msg["contactId"] = contactId;
            msg["token"] = this.authenData.token;
            pomelo.request("connector.entryHandler.hangupCall", msg, function (result) {
                console.log("hangupCall: ", JSON.stringify(result));
            });
        };
        ServerImplemented.prototype.theLineIsBusy = function (contactId) {
            var msg = {};
            msg["contactId"] = contactId;
            pomelo.request("connector.entryHandler.theLineIsBusy", msg, function (result) {
                console.log("theLineIsBusy response: " + JSON.stringify(result));
            });
        };
        return ServerImplemented;
    }());
    ServerImplemented.connectionProblemString = 'Server connection is unstable.';
    ChatServer.ServerImplemented = ServerImplemented;
    var ChatRoomApiProvider = (function () {
        function ChatRoomApiProvider() {
        }
        ChatRoomApiProvider.prototype.chat = function (room_id, target, sender_id, content, contentType, callback) {
            var message = {};
            message["rid"] = room_id;
            message["content"] = content;
            message["sender"] = sender_id;
            message["target"] = target;
            message["type"] = contentType;
            pomelo.request("chat.chatHandler.send", message, function (result) {
                var data = JSON.parse(JSON.stringify(result));
                if (callback !== null)
                    callback(null, data);
            });
        };
        ChatRoomApiProvider.prototype.chatFile = function (room_id, target, sender_id, fileUrl, contentType, meta, callback) {
            console.log("Send file to ", target);
            var message = {};
            message["rid"] = room_id;
            message["content"] = fileUrl;
            message["sender"] = sender_id;
            message["target"] = target;
            message["meta"] = meta;
            message["type"] = contentType;
            pomelo.request("chat.chatHandler.send", message, function (result) {
                var data = JSON.parse(JSON.stringify(result));
                console.log("chatFile callback: ", data);
                if (data.code == 200) {
                    if (callback != null) {
                        callback(null, data.data);
                    }
                }
                else {
                    console.error("WTF", "WTF god only know.");
                }
            });
        };
        ChatRoomApiProvider.prototype.getSyncDateTime = function (callback) {
            var message = {};
            pomelo.request("chat.chatHandler.getSyncDateTime", message, function (result) {
                if (callback != null) {
                    callback(null, result);
                }
            });
        };
        /**
         * getChatHistory function used for pull history chat record...
         * Beware!!! please call before JoinChatRoom.
         * @param room_id
         * @param lastAccessTime
         * @param callback
         */
        ChatRoomApiProvider.prototype.getChatHistory = function (room_id, lastAccessTime, callback) {
            var message = {};
            message["rid"] = room_id;
            if (lastAccessTime != null) {
                //<!-- Only first communication is has a problem.
                message["lastAccessTime"] = lastAccessTime.toString();
            }
            pomelo.request("chat.chatHandler.getChatHistory", message, function (result) {
                if (callback !== null)
                    callback(null, result);
            });
        };
        /**
         * get older message histories.
         */
        ChatRoomApiProvider.prototype.getOlderMessageChunk = function (roomId, topEdgeMessageTime, callback) {
            var message = {};
            message["rid"] = roomId;
            message["topEdgeMessageTime"] = topEdgeMessageTime.toString();
            pomelo.request("chat.chatHandler.getOlderMessageChunk", message, function (result) {
                if (callback !== null)
                    callback(null, result);
            });
        };
        ChatRoomApiProvider.prototype.checkOlderMessagesCount = function (roomId, topEdgeMessageTime, callback) {
            var message = {};
            message["rid"] = roomId;
            message["topEdgeMessageTime"] = topEdgeMessageTime.toString();
            pomelo.request("chat.chatHandler.checkOlderMessagesCount", message, function (result) {
                if (callback !== null)
                    callback(null, result);
            });
        };
        ChatRoomApiProvider.prototype.getMessagesReaders = function (topEdgeMessageTime) {
            var message = {};
            message["topEdgeMessageTime"] = topEdgeMessageTime;
            pomelo.request("chat.chatHandler.getMessagesReaders", message, function (result) {
                console.info('getMessagesReaders respones: ', result);
            });
        };
        ChatRoomApiProvider.prototype.getMessageContent = function (messageId, callback) {
            var message = {};
            message["messageId"] = messageId;
            pomelo.request("chat.chatHandler.getMessageContent", message, function (result) {
                if (!!callback) {
                    callback(null, result);
                }
            });
        };
        ChatRoomApiProvider.prototype.updateMessageReader = function (messageId, roomId) {
            var message = {};
            message["messageId"] = messageId;
            message["roomId"] = roomId;
            pomelo.notify("chat.chatHandler.updateWhoReadMessage", message);
        };
        ChatRoomApiProvider.prototype.updateMessageReaders = function (messageIds, roomId) {
            var message = {};
            message["messageIds"] = JSON.stringify(messageIds);
            message["roomId"] = roomId;
            pomelo.notify("chat.chatHandler.updateWhoReadMessages", message);
        };
        return ChatRoomApiProvider;
    }());
    ChatServer.ChatRoomApiProvider = ChatRoomApiProvider;
    var ServerEventListener = (function () {
        function ServerEventListener() {
        }
        ServerEventListener.prototype.addFrontendListener = function (obj) {
            this.frontendListener = obj;
        };
        ServerEventListener.prototype.addServerListener = function (obj) {
            this.serverListener = obj;
        };
        ServerEventListener.prototype.addChatListener = function (obj) {
            this.chatServerListener = obj;
        };
        ServerEventListener.prototype.addRTCListener = function (obj) {
            this.rtcCallListener = obj;
        };
        ServerEventListener.prototype.addListenner = function (resolve, rejected) {
            this.callFrontendServer();
            this.callChatServer();
            this.callRTCEvents();
            this.callServerEvents();
            resolve();
        };
        ServerEventListener.prototype.callFrontendServer = function () {
            var self = this;
            pomelo.on(ServerEventListener.ON_GET_ME, function (data) {
                console.log(ServerEventListener.ON_GET_ME);
                self.frontendListener.onGetMe(data);
            });
            pomelo.on(ServerEventListener.ON_GET_COMPANY_INFO, function (data) {
                console.log(ServerEventListener.ON_GET_COMPANY_INFO, JSON.stringify(data));
                self.frontendListener.onGetCompanyInfo(data);
            });
            //wait message from the server.
            pomelo.on(ServerEventListener.ON_GET_ORGANIZE_GROUPS, function (data) {
                console.log(ServerEventListener.ON_GET_ORGANIZE_GROUPS);
                self.frontendListener.onGetOrganizeGroupsComplete(data);
            });
            pomelo.on(ServerEventListener.ON_GET_COMPANY_MEMBERS, function (data) {
                console.log(ServerEventListener.ON_GET_COMPANY_MEMBERS);
                self.frontendListener.onGetCompanyMemberComplete(data);
            });
            pomelo.on(ServerEventListener.ON_GET_PRIVATE_GROUPS, function (data) {
                console.log(ServerEventListener.ON_GET_PRIVATE_GROUPS);
                self.frontendListener.onGetPrivateGroupsComplete(data);
            });
            pomelo.on(ServerEventListener.ON_GET_PROJECT_BASE_GROUPS, function (data) {
                console.log(ServerEventListener.ON_GET_PROJECT_BASE_GROUPS);
                self.frontendListener.onGetProjectBaseGroupsComplete(data);
            });
        };
        ServerEventListener.prototype.callChatServer = function () {
            var self = this;
            pomelo.on(ServerEventListener.ON_CHAT, function (data) {
                console.log(ServerEventListener.ON_CHAT, JSON.stringify(data));
                self.chatServerListener.onChat(data);
            });
            //pomelo.on(ServerEventListener.ON_ADD, (data) => {
            //    console.log(ServerEventListener.ON_ADD, data);
            //    self.onChatListener.on(data);
            //});
            pomelo.on(ServerEventListener.ON_LEAVE, function (data) {
                console.log(ServerEventListener.ON_LEAVE, JSON.stringify(data));
                self.chatServerListener.onLeaveRoom(data);
            });
            pomelo.on(ServerEventListener.ON_MESSAGE_READ, function (data) {
                // console.log(ServerEventListener.ON_MESSAGE_READ);
                self.chatServerListener.onMessageRead(data);
            });
            pomelo.on(ServerEventListener.ON_GET_MESSAGES_READERS, function (data) {
                // console.log(ServerEventListener.ON_GET_MESSAGES_READERS);
                self.chatServerListener.onGetMessagesReaders(data);
            });
        };
        ServerEventListener.prototype.callRTCEvents = function () {
            var self = this;
            pomelo.on(ServerEventListener.ON_VIDEO_CALL, function (data) {
                console.log(ServerEventListener.ON_VIDEO_CALL, JSON.stringify(data));
                self.rtcCallListener.onVideoCall(data);
            });
            pomelo.on(ServerEventListener.ON_VOICE_CALL, function (data) {
                console.log(ServerEventListener.ON_VOICE_CALL, JSON.stringify(data));
                self.rtcCallListener.onVoiceCall(data);
            });
            pomelo.on(ServerEventListener.ON_HANGUP_CALL, function (data) {
                console.log(ServerEventListener.ON_HANGUP_CALL, JSON.stringify(data));
                self.rtcCallListener.onHangupCall(data);
            });
            pomelo.on(ServerEventListener.ON_THE_LINE_IS_BUSY, function (data) {
                console.log(ServerEventListener.ON_THE_LINE_IS_BUSY, JSON.stringify(data));
                self.rtcCallListener.onTheLineIsBusy(data);
            });
        };
        ServerEventListener.prototype.callServerEvents = function () {
            var self = this;
            //<!-- AccessRoom Info -->
            pomelo.on(ServerEventListener.ON_ACCESS_ROOMS, function (data) {
                console.log(ServerEventListener.ON_ACCESS_ROOMS);
                self.serverListener.onAccessRoom(data);
            });
            pomelo.on(ServerEventListener.ON_ADD_ROOM_ACCESS, function (data) {
                console.log(ServerEventListener.ON_ADD_ROOM_ACCESS);
                self.serverListener.onAddRoomAccess(data);
            });
            pomelo.on(ServerEventListener.ON_UPDATED_LASTACCESSTIME, function (data) {
                console.log(ServerEventListener.ON_UPDATED_LASTACCESSTIME);
                self.serverListener.onUpdatedLastAccessTime(data);
            });
            //<!-- User -->
            pomelo.on(ServerEventListener.ON_USER_LOGIN, function (data) {
                console.log(ServerEventListener.ON_USER_LOGIN, data);
                self.serverListener.onUserLogin(data);
            });
            pomelo.on(ServerEventListener.ON_USER_UPDATE_PROFILE, function (data) {
                console.log(ServerEventListener.ON_USER_UPDATE_PROFILE);
                self.serverListener.onUserUpdateProfile(data);
            });
            pomelo.on(ServerEventListener.ON_USER_UPDATE_IMAGE_PROFILE, function (data) {
                console.log(ServerEventListener.ON_USER_UPDATE_IMAGE_PROFILE);
                self.serverListener.onUserUpdateImageProfile(data);
            });
            //<!-- Group -->
            pomelo.on(ServerEventListener.ON_CREATE_GROUP_SUCCESS, function (data) {
                console.log(ServerEventListener.ON_CREATE_GROUP_SUCCESS);
                self.serverListener.onCreateGroupSuccess(data);
            });
            pomelo.on(ServerEventListener.ON_EDITED_GROUP_MEMBER, function (data) {
                console.log(ServerEventListener.ON_EDITED_GROUP_MEMBER);
                self.serverListener.onEditedGroupMember(data);
            });
            pomelo.on(ServerEventListener.ON_EDITED_GROUP_NAME, function (data) {
                console.log(ServerEventListener.ON_EDITED_GROUP_NAME);
                self.serverListener.onEditedGroupName(data);
            });
            pomelo.on(ServerEventListener.ON_EDITED_GROUP_IMAGE, function (data) {
                console.log(ServerEventListener.ON_EDITED_GROUP_IMAGE);
                self.serverListener.onEditedGroupImage(data);
            });
            pomelo.on(ServerEventListener.ON_NEW_GROUP_CREATED, function (data) {
                console.log(ServerEventListener.ON_NEW_GROUP_CREATED);
                self.serverListener.onNewGroupCreated(data);
            });
            pomelo.on(ServerEventListener.ON_UPDATE_MEMBER_INFO_IN_PROJECTBASE, function (data) {
                console.log(ServerEventListener.ON_UPDATE_MEMBER_INFO_IN_PROJECTBASE);
                self.serverListener.onUpdateMemberInfoInProjectBase(data);
            });
        };
        return ServerEventListener;
    }());
    ServerEventListener.ON_ADD = "onAdd";
    ServerEventListener.ON_LEAVE = "onLeave";
    ServerEventListener.ON_CHAT = "onChat";
    ServerEventListener.ON_MESSAGE_READ = "onMessageRead";
    ServerEventListener.ON_GET_MESSAGES_READERS = "onGetMessagesReaders";
    ServerEventListener.ON_VIDEO_CALL = "onVideoCall";
    ServerEventListener.ON_VOICE_CALL = "onVoiceCall";
    ServerEventListener.ON_HANGUP_CALL = "onHangupCall";
    ServerEventListener.ON_THE_LINE_IS_BUSY = "onTheLineIsBusy";
    //<!-- AccessRoom Info -->
    ServerEventListener.ON_ACCESS_ROOMS = "onAccessRooms";
    ServerEventListener.ON_ADD_ROOM_ACCESS = "onAddRoomAccess";
    ServerEventListener.ON_UPDATED_LASTACCESSTIME = "onUpdatedLastAccessTime";
    //<!-- Group -->
    ServerEventListener.ON_CREATE_GROUP_SUCCESS = "onCreateGroupSuccess";
    ServerEventListener.ON_EDITED_GROUP_MEMBER = "onEditGroupMembers";
    ServerEventListener.ON_EDITED_GROUP_NAME = "onEditGroupName";
    ServerEventListener.ON_EDITED_GROUP_IMAGE = "onEditGroupImage";
    ServerEventListener.ON_NEW_GROUP_CREATED = "onNewGroupCreated";
    ServerEventListener.ON_UPDATE_MEMBER_INFO_IN_PROJECTBASE = "onUpdateMemberInfoInProjectBase";
    //<!-- User -->
    ServerEventListener.ON_USER_LOGIN = "onUserLogin";
    ServerEventListener.ON_USER_UPDATE_IMAGE_PROFILE = "onUserUpdateImgProfile";
    ServerEventListener.ON_USER_UPDATE_PROFILE = "onUserUpdateProfile";
    //<!-- Frontend server --->
    ServerEventListener.ON_GET_ME = "onGetMe";
    ServerEventListener.ON_GET_COMPANY_INFO = "onGetCompanyInfo";
    ServerEventListener.ON_GET_COMPANY_MEMBERS = "onGetCompanyMembers";
    ServerEventListener.ON_GET_PRIVATE_GROUPS = "onGetPrivateGroups";
    ServerEventListener.ON_GET_ORGANIZE_GROUPS = "onGetOrganizeGroups";
    ServerEventListener.ON_GET_PROJECT_BASE_GROUPS = "onGetProjectBaseGroups";
    ChatServer.ServerEventListener = ServerEventListener;
})(ChatServer || (ChatServer = {}));
var SocketComponent = (function () {
    function SocketComponent() {
    }
    SocketComponent.prototype.disconnected = function (reason) {
        if (!!this.onDisconnect) {
            this.onDisconnect(reason);
        }
        else {
            console.warn("onDisconnected delegate is empty.");
        }
    };
    return SocketComponent;
}());
var HttpStatusCode = (function () {
    function HttpStatusCode() {
    }
    return HttpStatusCode;
}());
HttpStatusCode.success = 200;
HttpStatusCode.fail = 500;
HttpStatusCode.requestTimeout = 408;
HttpStatusCode.duplicateLogin = 1004;
