const User = require('../models/User');
const Message = require('../models/Message');
const Chatroom = require('../models/Chatroom');

module.exports = {
    send: (req, res) => {
        let message = new Message({
            sender: req.user._id,
            recipient: req.body.recipient,
            body: req.body.body
        });

        if(message.body == null || message.body == ''){
        console.log("This message is blank");
        return res.status(403).json({message: "Blank message", sender: message.sender, recipient: message.recipient});
        }

        message.save((err) => {
            if (err) {
                return res.status(403).json(err);
            }
            Chatroom.findOne({$or:[{ members: [req.user._id, req.body.recipient] },{ members: [req.body.recipient, req.user._id] }]}).exec((err, chatroom) => {
                if(chatroom != undefined){
                    chatroom.messages.push(message._id);
                    chatroom.save((err) => {
                        if (err) {
                            return res.status(404).json(err);
                        }
                        return res.status(200).json({message: "Message Successfully Saved to DB", chatroom: chatroom._id, sender: message.sender, recipient: message.recipient});
                    })
                } else {
                    let chatroom = new Chatroom({
                        members: [req.user._id, req.body.recipient],
                        messages: message._id
                    });
                    chatroom.save((err) => {
                        if (err) {
                            return res.status(404).json(err);
                        }
                        return res.status(200).json({message: "Chatroom & Message Successfully Saved to DB", sender: message.sender, recipient: message.recipient});
                    });
                }
            });
            
        });
    },
    retrieve: (req, res) => {
        Chatroom.findOne({$or:[{ members: [req.user._id, req.params.id] },{ members: [req.params.id, req.user._id] }]}).limit(10).exec((err, chatroom) => {
            if (err) {
                throw err;
                return res.status(500).json(err);
            } else {
                Message.find().where('_id').in(chatroom.messages).exec((err, messages) => {
                    return res.status(200).json(messages);
                });
            }
        });
    },
    chatroom: (req, res) => {
        Chatroom.find({members: { "$in" : [req.user._id] }}).exec(async (err, chatroom) => {
            if (err) {
                throw err;
                return res.status(500).json(err);
            } else {
                let rooms = [];
                chatroom.forEach((element, index) => {
                    let message = "";
                    let messagePromise = new Promise(function (resolve, reject) {
                        Message.findOne({_id: element.messages.pop()}).exec((err, msg) => {
                            if (err) {
                                reject(err);
                            }
                            message = msg;
                            resolve();
                        });
                    });
                    messagePromise.then(() => {
                        rooms.push({"_id": element._id, "members": element.members, "message": message});
                        if(index == chatroom.length - 1) return res.status(200).json(rooms);
                    })
                });
            }
        });
    }
};

    /*chatroom: async (req, res) => {
        Chatroom.find({members: { "$in" : [req.user._id] }}).exec(async (err, chatroom) => {
            if (err) {
                throw err;
                return res.status(500).json(err);
            } else {
                const rooms = await generateRooms(chatroom);
                console.log("Rooms Sent:", rooms);
                return res.status(200).json(rooms);
            }
        });
    }
};


function generateRooms(chatroom) {
    let roomPromise = new Promise(function (resolve, reject) {
        if (chatroom == null) {
            reject({msg: "Chatroom is Null"});
        }
        let rooms = [];
        console.log("Chatroom Length:", chatroom.length);
        chatroom.forEach((element) => {
            console.log("Element:", element);
            let id = element.messages.pop();
            console.log("Message Object ID:", id);
            Message.findOne({_id: id}).exec((err, message) => {
                if (err) {
                    reject(err);
                }
                if (!message) {
                    reject({msg: "No messages found"});
                }
                rooms.push({"_id": element._id, "members": element.members, "message": message});
                console.log("Rooms Inside Loop", rooms);
           });
        });
        resolve(rooms);
    });
    console.log("Room Promise", roomPromise);
    return roomPromise;*/