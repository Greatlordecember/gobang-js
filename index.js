const express = require("express");
const ws = require("ws");

const port = 8080;
const wsPort = 8081;

const app = express();

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/html/index.html");
});

app.use('/', express.static(__dirname + '/'));

app.listen(port);

// [output message]
// - login-successful
// - login-failed
//
// - sync-rooms
// - join-room
//
// - put-chess
// - sync-checkerboard
// - sync-winner
// - sync-current-color
// - sync-player-slot
// - chat

// [input message]
// - login
//
// - create-room
// - join-room
//
// - quit-room
// - restart-game
// - put-chess
// - chat
// - request-player1
// - request-player2
// - quit-player1
// - quit-player2

const wss = new ws.WebSocketServer({port: wsPort});

const mapSize = 15;

// record client ip:port & name to key & value
let clientsName = {};

// let checkerboard = [];
// for(let i = 0; i < mapSize; ++i) {
//     checkerboard[i] = [];
//     for(let j = 0; j < mapSize; ++j) {
//         checkerboard[i][j] = "";
//     }
// }
// record every rooms' information, e.g.
// [
//     {
//         "winner": ""                // "player1" or "player2"
//         "currentRound": "",         // "player1" or "player2"
//         "player1Color": "black",    // "black" or "white"
//         "player1Ready": false,       // true or false
//         "player2Ready": false,       // true or false
//         "player1": "",              // ipPort of player1
//         "player2": "",              // ipPort of player2
//         "players": [],              // an array of ipPort
//         "checkerboard": [           // checker board, an n*n array, value is "black" or "white"
//             ["", "", "", ...],
//             ["", "", "", ...],
//             ["", "", "", ...],
//             ...
//         ]
//      },
// ]
let rooms = [];

wss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    const clientPort = req.socket.remotePort;
    const clientIpPort = `${clientIp}:${clientPort}`;

    console.log(`${clientIpPort} connected!`);

    // notify client to sync checkerboard
    // message = {};
    // message["type"] = "sync-checkerboard";
    // message["content"] = checkerboard;
    // messageRaw = JSON.stringify(message);
    // wss.clients.forEach((client) => {
    //     client.send(messageRaw);
    // });

    // notify client to sync winner
    // message = {};
    // message["type"] = "sync-winner";
    // message["content"] = winner;
    // messageRaw = JSON.stringify(message);
    // wss.clients.forEach((client) => {
    //     client.send(messageRaw);
    // });

    ws.on("message", (buffer) => {
        const messageRaw = buffer.toString();
        // console.log(messageRaw);
        const message = JSON.parse(messageRaw);

        console.log(`recieved message: ${message["type"]}`); //debug!!

        switch(message["type"]) {
            case "login": {
                const requestedName = message["content"].trim();
                if(requestedName) { // valid name
                    if(Object.values(clientsName).includes(requestedName)) { // name already taken
                        let messageToClient = {};
                        messageToClient["type"] = "login-failed";
                        messageToClient["content"] = "name already taken";
                        const messageToClientRaw = JSON.stringify(messageToClient);
                        ws.send(messageToClientRaw);
                    } else { // successful login
                        clientsName[clientIpPort] = requestedName;
                        let messageToClient = {};
                        messageToClient["type"] = "login-successfully";
                        let messageToClientRaw = JSON.stringify(messageToClient);
                        ws.send(messageToClientRaw);

                        // notify client to sync rooms
                        messageToClient = {};
                        messageToClient["type"] = "sync-rooms";
                        messageToClient["content"] = rooms;
                        messageToClientRaw = JSON.stringify(messageToClient);
                        ws.send(messageToClientRaw);
                    }
                } else { //empty name
                    let messageToClient = {};
                    messageToClient["type"] = "login-failed";
                    messageToClient["content"] = "please input a valid name";
                    const messageToClientRaw = JSON.stringify(messageToClient);
                    ws.send(messageToClientRaw);
                }
                break;
            }
            case "create-room": {
                // if the player is already in a room, ignore the message
                for(let roomId in rooms) {
                    if(rooms[roomId]["players"].includes(clientIpPort)) {
                        return;
                    }
                }

                // find the smallest available room id
                let roomId = rooms.length;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] == null) {
                        roomId = i;
                        break;
                    }
                }

                // create room
                rooms[roomId] = {};
                rooms[roomId]["currentColor"] = "black";
                rooms[roomId]["checkerboard"] = [];
                for(let i = 0; i < mapSize; ++i) {
                    rooms[roomId]["checkerboard"][i] = [];
                    for(let j = 0; j < mapSize; ++j) {
                        rooms[roomId]["checkerboard"][i][j] = "";
                    }
                }
                rooms[roomId]["players"] = [clientIpPort];

                // notify client the joined room id
                let messageToClient = {};
                messageToClient["type"] = "join-room";
                messageToClient["content"] = roomId;
                let messageToClientRaw = JSON.stringify(messageToClient);
                ws.send(messageToClientRaw);

                // notify the client to sync checkerboard
                messageToClient = {};
                messageToClient["type"] = "sync-checkerboard"
                messageToClient["content"] = rooms[roomId]["checkerboard"];
                messageToClientRaw = JSON.stringify(messageToClient);
                ws.send(messageToClientRaw);

                // notify the client to update player slot
                messageToClient = {};
                messageToClient["type"] = "sync-player-slot";
                messageToClient["content"] = {};
                messageToClient["content"]["player1"] = clientsName[rooms[roomId]["player1"]];
                messageToClient["content"]["player2"] = clientsName[rooms[roomId]["player2"]];
                messageToClient["content"]["clientIsPlayer1"] = rooms[roomId]["player1"] === clientIpPort;
                messageToClient["content"]["clientIsPlayer2"] = rooms[roomId]["player2"] === clientIpPort;
                messageToClient["content"]["player1Ready"] = rooms[roomId]["player1Ready"];
                messageToClient["content"]["player2Ready"] = rooms[roomId]["player2Ready"];
                messageToClientRaw = JSON.stringify(messageToClient);
                ws.send(messageToClientRaw);

                // notify all clients in the room page to sync rooms
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    // if the client have not login, return
                    if(clientsName[ipPort] == null) {
                        return;
                    }
                    // if the client is in battle page, return
                    let roomId = null;
                    for(let i = 0; i < rooms.length; ++i) {
                        if(rooms[i] != null) {
                            if(rooms[i]["players"].includes(ipPort)) {
                                roomId = i;
                            }
                        }
                    }
                    if(roomId != null) {
                        return;
                    }

                    // send message
                    messageToClient = {};
                    messageToClient["type"] = "sync-rooms";
                    messageToClient["content"] = rooms;
                    messageToClientRaw = JSON.stringify(messageToClient);
                    ws.send(messageToClientRaw);
                    client.send(messageToClientRaw);
                });

                // greeting to player in the same room
                messageToClient = {};
                messageToClient["type"] = "chat";
                messageToClient["content"] = `${clientsName[clientIpPort]} joined!`;
                messageToClientRaw = JSON.stringify(messageToClient);
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        client.send(messageToClientRaw);
                    }
                });

                break;
            }
            case "join-room": {
                let roomId = message["content"];
                // if the room is not available, return directly
                if(rooms[roomId] == null) {
                    return;
                }

                if(rooms[roomId]["players"] == null) {
                    rooms[roomId]["players"] = [];
                }
                rooms[roomId]["players"].push(clientIpPort);

                // notify client the joined room id
                let messageToClient = {};
                messageToClient["type"] = "join-room";
                messageToClient["content"] = roomId;
                let messageToClientRaw = JSON.stringify(messageToClient);
                ws.send(messageToClientRaw);

                // notify the client to sync checkerboard
                messageToClient = {};
                messageToClient["type"] = "sync-checkerboard"
                messageToClient["content"] = rooms[roomId]["checkerboard"];
                messageToClientRaw = JSON.stringify(messageToClient);
                ws.send(messageToClientRaw);

                // notify the client to update player slot
                messageToClient = {};
                messageToClient["type"] = "sync-player-slot";
                messageToClient["content"] = {};
                messageToClient["content"]["player1"] = clientsName[rooms[roomId]["player1"]];
                messageToClient["content"]["player2"] = clientsName[rooms[roomId]["player2"]];
                messageToClient["content"]["clientIsPlayer1"] = rooms[roomId]["player1"] === clientIpPort;
                messageToClient["content"]["clientIsPlayer2"] = rooms[roomId]["player2"] === clientIpPort;
                messageToClient["content"]["player1Ready"] = rooms[roomId]["player1Ready"];
                messageToClient["content"]["player2Ready"] = rooms[roomId]["player2Ready"];
                messageToClientRaw = JSON.stringify(messageToClient);
                ws.send(messageToClientRaw);

                // greeting to player in the same room
                messageToClient = {};
                messageToClient["type"] = "chat";
                messageToClient["content"] = `${clientsName[clientIpPort]} joined!`;
                messageToClientRaw = JSON.stringify(messageToClient);
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        client.send(messageToClientRaw);
                    }
                });

                break;
            }
            case "quit-room": {
                let roomId = null;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] != null) {
                        if(rooms[i]["players"].includes(clientIpPort)) {
                            roomId = i;
                        }
                    }
                }

                // if the client is not in any room, return directly
                if(roomId == null) {
                    return;
                }

                // say goodbye to all client in the room
                let messageToClient = {};
                messageToClient["type"] = "chat";
                messageToClient["content"] = `${clientsName[clientIpPort]} leaved!`;
                let messageToClientRaw = JSON.stringify(messageToClient);
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        client.send(messageToClientRaw);
                    }
                });

                // remove client from room
                if(rooms[roomId].black == clientIpPort) {
                    delete rooms[roomId].black;
                }
                if(rooms[roomId].player1 == clientIpPort) {
                    delete rooms[roomId].player1;
                }
                if(rooms[roomId].player2 == clientIpPort) {
                    delete rooms[roomId].player2;
                }
                rooms[roomId]["players"].splice(rooms[roomId]["players"].indexOf(clientIpPort), 1);
                if(rooms[roomId]["players"].length == 0) {
                    delete rooms[roomId];
                }

                // if the room not yet deleted, notify all clients in the same room to update player slot
                if(rooms[roomId] != null) {
                    wss.clients.forEach((client) => {
                        let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                        if(rooms[roomId]["players"].includes(ipPort)) {
                            let messageToClient = {};
                            messageToClient["type"] = "sync-player-slot";
                            messageToClient["content"] = {};
                            messageToClient["content"]["player1"] = clientsName[rooms[roomId]["player1"]];
                            messageToClient["content"]["player2"] = clientsName[rooms[roomId]["player2"]];
                            messageToClient["content"]["clientIsPlayer1"] = rooms[roomId]["player1"] === ipPort;
                            messageToClient["content"]["clientIsPlayer2"] = rooms[roomId]["player2"] === ipPort;
                            messageToClient["content"]["player1Ready"] = rooms[roomId]["player1Ready"];
                            messageToClient["content"]["player2Ready"] = rooms[roomId]["player2Ready"];
                            let messageToClientRaw = JSON.stringify(messageToClient);
                            client.send(messageToClientRaw);
                        }
                    });
                } else {
                    // notify all clients in the room page to sync rooms
                    wss.clients.forEach((client) => {
                        let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                        // if the client have not login, return
                        if(clientsName[ipPort] == null) {
                            return;
                        }
                        // if the client is in battle page, return
                        let roomId = null;
                        for(let i = 0; i < rooms.length; ++i) {
                            if(rooms[i] != null) {
                                if(rooms[i]["players"].includes(ipPort)) {
                                    roomId = i;
                                }
                            }
                        }
                        if(roomId != null) {
                            return;
                        }

                        // send message
                        messageToClient = {};
                        messageToClient["type"] = "sync-rooms";
                        messageToClient["content"] = rooms;
                        messageToClientRaw = JSON.stringify(messageToClient);
                        ws.send(messageToClientRaw);
                        client.send(messageToClientRaw);
                    });
                }

                // notify the quit client to sync rooms
                messageToClient = {};
                messageToClient["type"] = "sync-rooms";
                messageToClient["content"] = rooms;
                messageToClientRaw = JSON.stringify(messageToClient);
                ws.send(messageToClientRaw);

                break;
            }
            case "restart-game": {
                let roomId = null;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] != null) {
                        if(rooms[i]["players"].includes(clientIpPort)) {
                            roomId = i;
                        }
                    }
                }

                // if the game is not over, return directly
                if(rooms[roomId]["winner"] === "") {
                    return;
                }

                // reset the game
                rooms[roomId]["winner"] = "";
                rooms[roomId]["player1Ready"] = false;
                rooms[roomId]["player2Ready"] = false;
                rooms[roomId]["currentRound"] = (Math.random() > 0.5) ? "player1" : "player2";
                rooms[roomId]["player1Color"] = rooms[roomId]["currentRound"] == "player1" ? "black" : "white";

                // clear checkerboard
                for(let i = 0; i < mapSize; ++i) {
                    for(let j = 0; j < mapSize; ++j) {
                        rooms[roomId]["checkerboard"][i][j] = ""
                    }
                }

                // hint the game is restart
                let messageToClient = {};
                messageToClient["type"] = "chat";
                messageToClient["content"] = "[server] game restart!";
                let messageToClientRaw = JSON.stringify(messageToClient);
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        client.send(messageToClientRaw);
                    }
                });

                // notify client to sync checkerboard
                messageToClient = {};
                messageToClient["type"] = "sync-checkerboard";
                messageToClient["content"] = rooms[roomId]["checkerboard"];
                messageToClientRaw = JSON.stringify(messageToClient);
                wss.clients.forEach((client) => {
                    client.send(messageToClientRaw);
                });

                // notify client to sync winner
                messageToClient = {};
                messageToClient["type"] = "sync-winner";
                messageToClient["content"] = rooms[roomId]["winner"];
                messageToClientRaw = JSON.stringify(messageToClient);
                wss.clients.forEach((client) => {
                    client.send(messageToClientRaw);
                });

                // notify client to sync current color
                messageToClient = {};
                messageToClient["type"] = "sync-current-color";
                messageToClient["content"] = "black"
                messageToClientRaw = JSON.stringify(messageToClient);
                wss.clients.forEach((client) => {
                    client.send(messageToClientRaw);
                });

                break;
            }
            case "put-chess": {
                let roomId = null;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] != null) {
                        if(rooms[i]["players"].includes(clientIpPort)) {
                            roomId = i;
                        }
                    }
                }

                // if player is not in a room, return directly
                if(roomId == null) {
                    return;
                }

                console.log("debugging 1"); //debug!!

                // game not started, return directly
                if(rooms[roomId]["winner"] == null) {
                    return;
                }

                console.log("debugging 2"); //debug!!

                // already game over, return directly
                if(rooms[roomId]["winner"] === "player1" || rooms[roomId]["winner"] === "player2" || rooms[roomId]["winner"] === "draw") {
                    return;
                }

                console.log("debugging 3"); //debug!!

                // if the client is not the current round player, return directly
                console.log(rooms[roomId]["currentRound"]);
                console.log(rooms[roomId][rooms[roomId]["currentRound"]]);
                if(rooms[roomId][rooms[roomId]["currentRound"]] !== clientIpPort) {
                    return;
                }

                console.log("debugging 4"); //debug!!

                const point = message["content"].split(",");
                const x = parseInt(point[0]);
                const y = parseInt(point[1]);

                // check if the point is valid
                if(!Number.isInteger(x) || !Number.isInteger(y) && x >= 0 && y >= 0 && x < mapSize && y < mapSize) {
                    return;
                }

                // if the point already have a chess, return directly
                if(rooms[roomId]["checkerboard"][x][y] !== "") {
                    return;
                }

                // get current color
                let currentColor;
                if(rooms[roomId]["currentRound"] == "player1") {
                    if(rooms[roomId]["player1Color"] == "black") {
                        currentColor = "black";
                    } else {
                        currentColor = "white";
                    }
                } else {
                    if(rooms[roomId]["player1Color"] == "black") {
                        currentColor = "white";
                    } else {
                        currentColor = "black";
                    }
                }

                // put chess to checkerboard
                rooms[roomId]["checkerboard"][x][y] = currentColor;

                // send put chess message to player in the same room
                let messageToClient = {};
                messageToClient["type"] = "put-chess";
                messageToClient["content"] = message["content"] + `,${currentColor}`;
                let messageToClientRaw = JSON.stringify(messageToClient);
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        rooms[roomId]["checkerboard"][x][y] = currentColor;
                        client.send(messageToClientRaw);
                    }
                });

                // change turn
                if(rooms[roomId]["currentRound"] == "player1") {
                    rooms[roomId]["currentRound"] = "player2";
                } else {
                    rooms[roomId]["currentRound"] = "player1";
                }
                currentColor = currentColor == "black" ? "white" : "black";

                // notify client to sync current color
                messageToClient = {};
                messageToClient["type"] = "sync-current-color";
                messageToClient["content"] = currentColor;
                messageToClientRaw = JSON.stringify(messageToClient);
                wss.clients.forEach((client) => {
                    client.send(messageToClientRaw);
                });


                // check winner
                // shape1
                // *
                //   *
                //     *
                //       *
                //         *
                for(let i = 0; i < mapSize - 4; ++i) {
                    for(let j = 0; j < mapSize - 4; ++j) {
                        for(let k = 1; k < 5; ++k) {
                            const firstColor = rooms[roomId]["checkerboard"][i][j];
                            if(firstColor === "") {
                                break;
                            }
                            if(firstColor !== rooms[roomId]["checkerboard"][i + k][j + k]) {
                                break;
                            }
                            if(k === 4) {
                                rooms[roomId]["winner"] = rooms[roomId]["firstColor"] == "player1Color" ? "player1" : "player2";
                                console.log(`winner is ${rooms[roomId]["winner"]}, shape1`); //debug!!
                            }
                        }
                    }
                }
                // shape2
                //         *
                //       *
                //     *
                //   *
                // *
                for(let i = 0; i < mapSize - 4; ++i) {
                    for(let j = 0; j < mapSize - 4; ++j) {
                        for(let k = 1; k < 5; ++k) {
                            const firstColor = rooms[roomId]["checkerboard"][i + 4][j];
                            if(firstColor === "") {
                                break;
                            }
                            if(firstColor !== rooms[roomId]["checkerboard"][i + (4 - k)][j + k]) {
                                break;
                            }
                            if(k === 4) {
                                rooms[roomId]["winner"] = rooms[roomId]["firstColor"] == "player1Color" ? "player1" : "player2";
                                console.log(`winner is ${rooms[roomId]["winner"]}, shape2`); //debug!!
                            }
                        }
                    }
                }
                // shape3
                // *
                // *
                // *
                // *
                // *
                for(let i = 0; i < mapSize; ++i) {
                    for(let j = 0; j < mapSize - 4; ++j) {
                        for(let k = 1; k < 5; ++k) {
                            const firstColor = rooms[roomId]["checkerboard"][i][j];
                            if(firstColor === "") {
                                break;
                            }
                            if(firstColor !== rooms[roomId]["checkerboard"][i][j + k]) {
                                break;
                            }
                            if(k === 4) {
                                rooms[roomId]["winner"] = rooms[roomId]["firstColor"] == "player1Color" ? "player1" : "player2";
                                console.log(`winner is ${rooms[roomId]["winner"]}, shape3`); //debug!!
                            }
                        }
                    }
                }
                // shape4
                // * * * * *
                for(let i = 0; i < mapSize - 4; ++i) {
                    for(let j = 0; j < mapSize; ++j) {
                        for(let k = 1; k < 5; ++k) {
                            const firstColor = rooms[roomId]["checkerboard"][i][j];
                            if(firstColor === "") {
                                break;
                            }
                            if(firstColor !== rooms[roomId]["checkerboard"][i + k][j]) {
                                break;
                            }
                            if(k === 4) {
                                rooms[roomId]["winner"] = rooms[roomId]["firstColor"] == "player1Color" ? "player1" : "player2";
                                console.log(`winner is ${rooms[roomId]["winner"]}, shape4`); //debug!!
                            }
                        }
                    }
                }

                // check if the checkerboard is full
                let checkerboardFull = true;
                for(let i = 0; i < mapSize; ++i) {
                    for(let j = 0; j < mapSize; ++j) {
                        if(rooms[roomId]["checkerboard"][i][j] === "") {
                            checkerboardFull = false;
                        }
                    }
                }
                if(checkerboardFull) {
                    rooms[roomId]["winner"] = "draw";
                }

                if(rooms[roomId]["winner"] !== "") {
                    console.log(rooms[roomId]["winner"]); //debug!!
                    // notify client to sync winner
                    let messageToClient = {};
                    messageToClient["type"] = "sync-winner";
                    messageToClient["content"] = rooms[roomId]["winner"];
                    let messageToClientRaw = JSON.stringify(messageToClient);
                    wss.clients.forEach((client) => {
                        client.send(messageToClientRaw);
                    });

                    // send winning message to chat
                    messageToClient = {};
                    messageToClient["type"] = "chat";
                    if(rooms[roomId]["winner"] !== "draw") {
                        messageToClient["content"] = `[server] ${clientsName[rooms[roomId][rooms[roomId]["winner"]]]} wins!`;
                    } else {
                        messageToClient["content"] = `[server] It's a draw!`;
                    }
                    messageToClientRaw = JSON.stringify(messageToClient);
                    wss.clients.forEach((client) => {
                        client.send(messageToClientRaw);
                    });
                }

                break;
            }
            case "request-player1": {
                let roomId = null;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] != null) {
                        if(rooms[i]["players"].includes(clientIpPort)) {
                            roomId = i;
                        }
                    }
                }

                // if the client is not in any room, return directly
                if(roomId == null) {
                    return;
                }

                // if the request client is not in the room or player1 is not empty, return directly
                if(!rooms[roomId]["players"].includes(clientIpPort) || rooms[roomId]["player1"] != null) {
                    return;
                }

                // if the player is already in the player2 slot, remove from player2 slot
                if(rooms[roomId]["player2"] == clientIpPort) {
                    delete rooms[roomId]["player2"];
                    rooms[roomId]["player2Ready"] = false;
                }

                // join player1 slot
                rooms[roomId]["player1"] = clientIpPort;

                // notify all clients in the same room to update player slot
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        let messageToClient = {};
                        messageToClient["type"] = "sync-player-slot";
                        messageToClient["content"] = {};
                        messageToClient["content"]["player1"] = clientsName[rooms[roomId]["player1"]];
                        messageToClient["content"]["player2"] = clientsName[rooms[roomId]["player2"]];
                        messageToClient["content"]["clientIsPlayer1"] = rooms[roomId]["player1"] === ipPort;
                        messageToClient["content"]["clientIsPlayer2"] = rooms[roomId]["player2"] === ipPort;
                        messageToClient["content"]["player1Ready"] = rooms[roomId]["player1Ready"];
                        messageToClient["content"]["player2Ready"] = rooms[roomId]["player2Ready"];
                        let messageToClientRaw = JSON.stringify(messageToClient);
                        client.send(messageToClientRaw);
                    }
                });

                break;
            }
            case "player1-ready": {
                let roomId = null;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] != null) {
                        if(rooms[i]["players"].includes(clientIpPort)) {
                            roomId = i;
                        }
                    }
                }

                // if the client is not in any room, return directly
                if(roomId == null) {
                    return;
                }

                // if client is not player1, return
                if(rooms[roomId]["player1"] !== clientIpPort) {
                    return;
                }

                rooms[roomId]["player1Ready"] = true;

                // start the game if two players are ready
                if(rooms[roomId]["player1Ready"] && rooms[roomId]["player2Ready"]) {
                    rooms[roomId]["winner"] = "";

                    rooms[roomId]["currentRound"] = (Math.random() > 0.5) ? "player1" : "player2";
                    rooms[roomId]["player1Color"] = rooms[roomId]["currentRound"] == "player1" ? "black" : "white";

                    // hint the player in this room, the game is started
                    let messageToClient = {};
                    messageToClient["type"] = "chat";
                    messageToClient["content"] = `[server] game started!`;
                    let messageToClientRaw = JSON.stringify(messageToClient);
                    wss.clients.forEach((client) => {
                        let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                        if(rooms[roomId]["players"].includes(ipPort)) {
                            client.send(messageToClientRaw);
                        }
                    });
                }

                // notify all clients in the same room to update player slot
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        let messageToClient = {};
                        messageToClient["type"] = "sync-player-slot";
                        messageToClient["content"] = {};
                        messageToClient["content"]["player1"] = clientsName[rooms[roomId]["player1"]];
                        messageToClient["content"]["player2"] = clientsName[rooms[roomId]["player2"]];
                        messageToClient["content"]["clientIsPlayer1"] = rooms[roomId]["player1"] === ipPort;
                        messageToClient["content"]["clientIsPlayer2"] = rooms[roomId]["player2"] === ipPort;
                        messageToClient["content"]["player1Ready"] = rooms[roomId]["player1Ready"];
                        messageToClient["content"]["player2Ready"] = rooms[roomId]["player2Ready"];
                        let messageToClientRaw = JSON.stringify(messageToClient);
                        client.send(messageToClientRaw);
                    }
                });

                break;
            }
            case "quit-player1": {
                let roomId = null;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] != null) {
                        if(rooms[i]["players"].includes(clientIpPort)) {
                            roomId = i;
                        }
                    }
                }

                // if the client is not in any room, return directly
                if(roomId == null) {
                    return;
                }

                // if client is not player1, return
                if(rooms[roomId]["player1"] !== clientIpPort) {
                    return;
                }

                // remove player1 information
                delete rooms[roomId]["player1"];
                rooms[roomId]["player1Ready"] = false;

                // notify all clients in the same room to update player slot
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        let messageToClient = {};
                        messageToClient["type"] = "sync-player-slot";
                        messageToClient["content"] = {};
                        messageToClient["content"]["player1"] = clientsName[rooms[roomId]["player1"]];
                        messageToClient["content"]["player2"] = clientsName[rooms[roomId]["player2"]];
                        messageToClient["content"]["clientIsPlayer1"] = rooms[roomId]["player1"] === ipPort;
                        messageToClient["content"]["clientIsPlayer2"] = rooms[roomId]["player2"] === ipPort;
                        messageToClient["content"]["player1Ready"] = rooms[roomId]["player1Ready"];
                        messageToClient["content"]["player2Ready"] = rooms[roomId]["player2Ready"];
                        let messageToClientRaw = JSON.stringify(messageToClient);
                        client.send(messageToClientRaw);
                    }
                });

                break;
            }
            case "request-player2": {
                let roomId = null;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] != null) {
                        if(rooms[i]["players"].includes(clientIpPort)) {
                            roomId = i;
                        }
                    }
                }

                // if the client is not in any room, return directly
                if(roomId == null) {
                    return;
                }

                // if the request client is not in the room or player2 is not empty, return directly
                if(!rooms[roomId]["players"].includes(clientIpPort) || rooms[roomId]["player2"] != null) {
                    return;
                }

                // if the player is already in the player1 slot, remove from player1 slot
                if(rooms[roomId]["player1"] == clientIpPort) {
                    delete rooms[roomId]["player1"];
                    rooms[roomId]["player1Ready"] = false;
                }

                // join player2 slot
                rooms[roomId]["player2"] = clientIpPort;

                // notify all clients in the same room to update player slot
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        let messageToClient = {};
                        messageToClient["type"] = "sync-player-slot";
                        messageToClient["content"] = {};
                        messageToClient["content"]["player1"] = clientsName[rooms[roomId]["player1"]];
                        messageToClient["content"]["player2"] = clientsName[rooms[roomId]["player2"]];
                        messageToClient["content"]["clientIsPlayer1"] = rooms[roomId]["player1"] === ipPort;
                        messageToClient["content"]["clientIsPlayer2"] = rooms[roomId]["player2"] === ipPort;
                        messageToClient["content"]["player1Ready"] = rooms[roomId]["player1Ready"];
                        messageToClient["content"]["player2Ready"] = rooms[roomId]["player2Ready"];
                        let messageToClientRaw = JSON.stringify(messageToClient);
                        client.send(messageToClientRaw);
                    }
                });

                break;
            }
            case "player2-ready": {
                let roomId = null;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] != null) {
                        if(rooms[i]["players"].includes(clientIpPort)) {
                            roomId = i;
                        }
                    }
                }

                // if the client is not in any room, return directly
                if(roomId == null) {
                    return;
                }

                // if client is not player2, return
                if(rooms[roomId]["player2"] !== clientIpPort) {
                    return;
                }

                rooms[roomId]["player2Ready"] = true;

                // start the game if two players are ready
                if(rooms[roomId]["player1Ready"] && rooms[roomId]["player2Ready"]) {
                    rooms[roomId]["winner"] = "";

                    rooms[roomId]["currentRound"] = (Math.random() > 0.5) ? "player1" : "player2";
                    rooms[roomId]["player1Color"] = rooms[roomId]["currentRound"] == "player1" ? "black" : "white";

                    // hint the player in this room, the game is started
                    let messageToClient = {};
                    messageToClient["type"] = "chat";
                    messageToClient["content"] = `[server] game started!`;
                    let messageToClientRaw = JSON.stringify(messageToClient);
                    wss.clients.forEach((client) => {
                        let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                        if(rooms[roomId]["players"].includes(ipPort)) {
                            client.send(messageToClientRaw);
                        }
                    });
                }

                // notify all clients in the same room to update player slot
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        let messageToClient = {};
                        messageToClient["type"] = "sync-player-slot";
                        messageToClient["content"] = {};
                        messageToClient["content"]["player1"] = clientsName[rooms[roomId]["player1"]];
                        messageToClient["content"]["player2"] = clientsName[rooms[roomId]["player2"]];
                        messageToClient["content"]["clientIsPlayer1"] = rooms[roomId]["player1"] === ipPort;
                        messageToClient["content"]["clientIsPlayer2"] = rooms[roomId]["player2"] === ipPort;
                        messageToClient["content"]["player1Ready"] = rooms[roomId]["player1Ready"];
                        messageToClient["content"]["player2Ready"] = rooms[roomId]["player2Ready"];
                        let messageToClientRaw = JSON.stringify(messageToClient);
                        client.send(messageToClientRaw);
                    }
                });

                break;
            }
            case "quit-player2": {
                let roomId = null;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] != null) {
                        if(rooms[i]["players"].includes(clientIpPort)) {
                            roomId = i;
                        }
                    }
                }

                // if the client is not in any room, return directly
                if(roomId == null) {
                    return;
                }

                // if client is not player2, return
                if(rooms[roomId]["player2"] !== clientIpPort) {
                    return;
                }

                // remove player2 information
                delete rooms[roomId]["player2"];
                rooms[roomId]["player2Ready"] = false;

                // notify all clients in the same room to update player slot
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        let messageToClient = {};
                        messageToClient["type"] = "sync-player-slot";
                        messageToClient["content"] = {};
                        messageToClient["content"]["player1"] = clientsName[rooms[roomId]["player1"]];
                        messageToClient["content"]["player2"] = clientsName[rooms[roomId]["player2"]];
                        messageToClient["content"]["clientIsPlayer1"] = rooms[roomId]["player1"] === ipPort;
                        messageToClient["content"]["clientIsPlayer2"] = rooms[roomId]["player2"] === ipPort;
                        messageToClient["content"]["player1Ready"] = rooms[roomId]["player1Ready"];
                        messageToClient["content"]["player2Ready"] = rooms[roomId]["player2Ready"];
                        let messageToClientRaw = JSON.stringify(messageToClient);
                        client.send(messageToClientRaw);
                    }
                });

                break;
            }
            case "chat": {
                // send chat to player in the same room
                let messageToClient = {};
                messageToClient["type"] = "chat";
                messageToClient["content"] = `${clientsName[clientIpPort]}: ${message["content"]}`;
                const messageToClientRaw = JSON.stringify(messageToClient);
                let roomId = null;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] != null) {
                        if(rooms[i]["players"].includes(clientIpPort)) {
                            roomId = i;
                        }
                    }
                }
                wss.clients.forEach((client) => {
                    let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                    if(rooms[roomId]["players"].includes(ipPort)) {
                        client.send(messageToClientRaw);
                    }
                });
                break;
            }
        }
    });

    ws.on("close", () => {
        console.log(`${clientIpPort} disconnected!`);

        // say goodbye to all players in the same room
        let roomId = null;
        for(let i = 0; i < rooms.length; ++i) {
            if(rooms[i] != null) {
                if(rooms[i]["players"].includes(clientIpPort)) {
                    roomId = i;
                }
            }
        }
        if(roomId != null) {
            let messageToClient = {};
            messageToClient["type"] = "chat";
            messageToClient["content"] = `${clientsName[clientIpPort]} leaved!`;
            let messageToClientRaw = JSON.stringify(messageToClient);
            wss.clients.forEach((client) => {
                let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                if(rooms[roomId]["players"].includes(ipPort)) {
                    client.send(messageToClientRaw);
                }
            });
        }

        // remove client from room
        if(roomId != null) {
            delete rooms[roomId]["player1Color"];
            if(rooms[roomId]["player1"] == clientIpPort) {
                delete rooms[roomId]["player1"];
                rooms[roomId]["player1Ready"] = false;
            }
            if(rooms[roomId]["player2"] == clientIpPort) {
                delete rooms[roomId]["player2"];
                rooms[roomId]["player2Ready"] = false;
            }
            rooms[roomId]["players"].splice(rooms[roomId]["players"].indexOf(clientIpPort), 1);
            if(rooms[roomId]["players"].length == 0) {
                delete rooms[roomId];
            }
        }

        // if the room not yet deleted, notify all clients in the same room to update player slot
        if(rooms[roomId] != null) {
            wss.clients.forEach((client) => {
                let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                if(rooms[roomId]["players"].includes(ipPort)) {
                    let messageToClient = {};
                    messageToClient["type"] = "sync-player-slot";
                    messageToClient["content"] = {};
                    messageToClient["content"]["player1"] = clientsName[rooms[roomId]["player1"]];
                    messageToClient["content"]["player2"] = clientsName[rooms[roomId]["player2"]];
                    messageToClient["content"]["clientIsPlayer1"] = rooms[roomId]["player1"] === ipPort;
                    messageToClient["content"]["clientIsPlayer2"] = rooms[roomId]["player2"] === ipPort;
                    messageToClient["content"]["player1Ready"] = rooms[roomId]["player1Ready"];
                    messageToClient["content"]["player2Ready"] = rooms[roomId]["player2Ready"];
                    let messageToClientRaw = JSON.stringify(messageToClient);
                    client.send(messageToClientRaw);
                }
            });
        } else {
            // notify all clients in the room page to sync rooms
            wss.clients.forEach((client) => {
                let ipPort = `${client["_socket"]["_peername"]["address"]}:${client["_socket"]["_peername"]["port"]}`;
                // if the client have not login, return
                if(clientsName[ipPort] == null) {
                    return;
                }
                // if the client is in battle page, return
                let roomId = null;
                for(let i = 0; i < rooms.length; ++i) {
                    if(rooms[i] != null) {
                        if(rooms[i]["players"].includes(ipPort)) {
                            roomId = i;
                        }
                    }
                }
                if(roomId != null) {
                    return;
                }

                // send message
                messageToClient = {};
                messageToClient["type"] = "sync-rooms";
                messageToClient["content"] = rooms;
                messageToClientRaw = JSON.stringify(messageToClient);
                ws.send(messageToClientRaw);
                client.send(messageToClientRaw);
            });
        }

        // remove client ip:port and name record from object
        delete clientsName[clientIpPort];
    });
});
