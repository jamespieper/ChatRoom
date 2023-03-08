// Require the packages we will use:
const http = require("http"),
    fs = require("fs");

const port = 3456;
const file = "client.html";
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html, on port 3456:
const server = http.createServer(function (req, res) {
    // This callback runs when a new connection is made to our HTTP server.

    fs.readFile(file, function (err, data) {
        // This callback runs when the client.html file has been read from the filesystem.

        if (err) return res.writeHead(500);
        res.writeHead(200);
        res.end(data);
    });
});
server.listen(port);

// initialize Objects to act as dictionaries

let user_list = {};                         // keep track of users
let room_list = { "Home": undefined };      // keep track of rooms
let user_locations = {};                    // keep track of which user is in which room
let room_pass = { "Home": "" };             // keep track of room passwords
let banned_users = {};                      // keep track of banned users

// Import Socket.IO and pass our HTTP server object to it.
const socketio = require("socket.io")(http, {
    wsEngine: 'ws'
});

// Attach our Socket.IO server to our HTTP server to listen
const io = socketio.listen(server);
io.sockets.on("connection", function (socket) {

    socket.on('add_user', function (data) {
        
        // check to see if username already exists
        if (data["user"] in user_list) {

            //and notify user
            io.sockets.emit("login_fail", { result: "name_exists" });   
        } 

        // otherwise we will create a new user and display the home page
        else {
            
            user_list[data["user"]] = socket.id;
            socket.user = data["user"];
            socket.room = "Home";
            socket.join(socket.room);
            user_locations[data["user"]] = "Home";

            io.to(socket.room).emit("login", { rooms_keys: Object.keys(room_list), users: Object.keys(user_list), user_locations: user_locations, user_locations_keys: Object.keys(user_locations), rooms: room_list, user: socket.user });
            io.to(socket.room).emit("display_rooms", { rooms_keys: Object.keys(room_list), passwords: Object.values(room_pass) });
            io.sockets.emit("display_users", { rooms_keys: Object.keys(room_list), users: Object.keys(user_list), user_locations: user_locations, user_locations_keys: Object.keys(user_locations), rooms: room_list });
        }
    });

    // create a chat room
    socket.on('create_room', function (data) {

        // check to see if the room name already exists
        if (data["room"] in room_list) {
            
            // notify user
            io.to(socket.id).emit("message_to_client", { message: "Room name already exists", user: "System Admin"});
        } 

        // if not, create the new room using the given name
        else {
            room_list[data["room"]] = data["user"];
            user_locations[data["user"]] = data["room"];
            room_pass[data["room"]] = data["password"];

            // change to new room when created
            socket.room = data["room"];
            socket.leave("Home");
            socket.join(socket.room);

            io.to(socket.room).emit("room_joined", { rooms_keys: Object.keys(room_list), room: socket.room, user_locations_keys: Object.keys(user_locations), user_locations: user_locations, rooms: room_list, room_passwords: room_pass, passwords_keys: Object.keys(room_pass) });
            io.sockets.emit("display_rooms", { rooms_keys: Object.keys(room_list), passwords: Object.values(room_pass) });
            io.sockets.emit("display_users", { rooms_keys: Object.keys(room_list), users: Object.keys(user_list), user_locations: user_locations, user_locations_keys: Object.keys(user_locations), rooms: room_list });
        }
    });

    // delete a chat room
    socket.on('delete_room', function (data) {
        
        // get room and user data
        let room_to_delete = data["room"];
        let room_admin = data["user"];

        // iterate through each room
        for (let i of Object.keys(room_list)) {

            // see if the room we're in matches it
            if (room_to_delete == i) { 

                // see if current user is admin
                if (room_list[i] == room_admin) { 

                    // iterate through user locations
                    for (let j of Object.keys(user_locations)) {

                        // if we can delete this room
                        if (user_locations[j] == room_to_delete) {

                            // redirect to home
                            user_locations[j] = "Home";
                            let temp_socket_id = user_list[j];
                            let temp_socket = io.sockets.sockets.get(temp_socket_id);

                            temp_socket.leave(room_to_delete);
                            temp_socket.room = "Home";
                            temp_socket.join(temp_socket.room);

                            io.to(temp_socket_id).emit("room_left", { rooms_keys: Object.keys(room_list), room: "Home", user_locations_keys: Object.keys(user_locations), user_locations: user_locations, rooms: room_list, room_passwords: room_pass, passwords_keys: Object.keys(room_pass) });
                            io.to(temp_socket_id).emit("message_to_client", { message: "Room has been deleted.", user: "System Admin" });
                        }
                    }

                    // delete room and password from dictionaries
                    delete room_list[room_to_delete];
                    delete room_pass[room_to_delete];
                    user_locations[data["user"]] = "Home";

                    io.to(socket.id).emit("room_left", { rooms_keys: Object.keys(room_list), room: "Home", user_locations_keys: Object.keys(user_locations), user_locations: user_locations, rooms: room_list, room_passwords: room_pass, passwords_keys: Object.keys(room_pass) });
                }
            }
        }

        // re-display home elements
        io.sockets.emit("display_rooms", { rooms_keys: Object.keys(room_list), passwords: Object.values(room_pass) });
        io.sockets.emit("display_users", { rooms_keys: Object.keys(room_list), users: Object.keys(user_list), user_locations: user_locations, user_locations_keys: Object.keys(user_locations), rooms: room_list });

    });


    // join chat room
    socket.on('join_room', function (data) {
        
        // check to see if the user is banned from this room
        if ((data["room"] in banned_users) && (banned_users[data["room"]].includes(data["user"]))) {
            
            // redirect user to home
            user_locations[data["user"]] = "Home";
            socket.room = "Home";
            io.to(socket.room).emit("room_left", { room: "Home", rooms_keys: Object.keys(room_list), user_locations: user_locations, user_locations_keys: Object.keys(user_locations), rooms: room_list });
            
            // notify user that they are banned
            io.to(socket.room).emit("message_to_client", { message: "You are banned from this room!", user: "System Admin" });
        }

        // if not banned, then we will join the room
        else {
            user_locations[data["user"]] = data["room"];
            socket.room = data["room"];
            socket.leave("Home");
            socket.join(socket.room);
            io.to(socket.room).emit("room_joined", { rooms_keys: Object.keys(room_list), room: socket.room, user_locations_keys: Object.keys(user_locations), user_locations: user_locations, rooms: room_list, room_passwords: room_pass, passwords_keys: Object.keys(room_pass) });
            io.sockets.emit("display_users", { rooms_keys: Object.keys(room_list), users: Object.keys(user_list), user_locations: user_locations, user_locations_keys: Object.keys(user_locations), rooms: room_list });
        }

    });

    // leave chat room
    socket.on('leave_room', function (data) {
        
        // direct user to home
        user_locations[data["user"]] = "Home";
        socket.room = "Home";
        socket.leave(data["room"]);
        socket.join(socket.room);
        io.to(socket.room).emit("room_left", { room: "Home", rooms_keys: Object.keys(room_list), user_locations: user_locations, user_locations_keys: Object.keys(user_locations), rooms: room_list });
        io.sockets.emit("display_users", { rooms_keys: Object.keys(room_list), users: Object.keys(user_list), user_locations: user_locations, user_locations_keys: Object.keys(user_locations), rooms: room_list });
    });

    // Attach our Socket.IO server to our HTTP server to listen
    socket.on('message_to_server', function (data) {
        // This callback runs when the server receives a new message from the client.
        console.log("message: " + data["message"]); // log it to the Node.JS output
        socket.room = data["room"];
        socket.join(socket.room);
        io.to(socket.room).emit("message_to_client", { message: data["message"], user: data["user"], room: socket.room }) // broadcast the message to other users
    });

    // same as above, sending a message
    socket.on('private_message_to_server', function (data) {

        // get our target user, and create a message to then emit to them
        let target_user = user_list[data["target_user"]];
        let message = data["message"];
        message = "(private message) " + message;
        io.to(target_user).emit("message_to_client", { message: message, user: data["from_user"] });
        
    });

    // kick user from chat room
    socket.on('kick_user', function (data) {

        // get info of admin and target to kick, and room to kick from
        let admin = data["kicking_user"];
        let user_to_kick = data["kicked_user"];
        let room = data["room"];

        let kicked_id = user_list[user_to_kick];
        let kicked_socket = io.sockets.sockets.get(kicked_id);

        // make sure person kicking is admin of the room
        if (room_list[room] == admin) {

            // see if person getting kicked is currently in the room
            if (user_locations[user_to_kick] == room) {

                // redirect kicked person and redirect to home
                user_locations[user_to_kick] = "Home";
                kicked_socket.room = "Home";
                kicked_socket.leave(room);
                kicked_socket.join(kicked_socket.room);
                io.to(kicked_id).emit("room_left", { room: "Home", rooms_keys: Object.keys(room_list), user_locations: user_locations, user_locations_keys: Object.keys(user_locations), rooms: room_list });
                
                // notify person they've been kicked
                let message = "You have been kicked from " + room;
                io.to(kicked_id).emit("message_to_client", { message: message, user: "System Admin" });
                io.sockets.emit("display_users", { rooms_keys: Object.keys(room_list), users: Object.keys(user_list), user_locations: user_locations, user_locations_keys: Object.keys(user_locations), rooms: room_list });
            }
        }
        // if user isn't room admin, tell them they can't kick people
        else {
            io.to(user_list[admin]).emit("message_to_client", { message: "You don't have the power to do that.", user: "System Admin", room: room });
        }
    });
    
    // same as above, but ban instead of kick
    socket.on("ban_user", function(data){ 
        
        // get info of admin and target to ban, and room to kick from
        let admin = data["banning_user"];
        let user_to_ban = data["banned_user"];
        let room = data["room"];

        let banned_id = user_list[user_to_ban];
        let banned_socket = io.sockets.sockets.get(banned_id);
        
        // check to see if user is admin. If so, allow them to add person
        // to a ban list for this room
        if (room_list[room] == admin) {

            
            if (room in banned_users) {
                banned_users[room].push(user_to_ban); 
            }
            else {
                banned_users[room] = new Array(); 
                banned_users[room].push(user_to_ban); 
            }

            // ban user and redirect them to Home
            if (user_locations[user_to_ban] == room) {
                user_locations[user_to_ban] = "Home"; 
                banned_socket.room = "Home";
                banned_socket.leave(room);
                banned_socket.join(banned_socket.room);
                io.to(banned_id).emit("room_left", {room: "Home", rooms_keys:Object.keys(room_list), user_locations:user_locations, user_locations_keys: Object.keys(user_locations), rooms:room_list});
            }

            // show home
            io.sockets.emit("user_banned", {rooms:room_list, user_locations:user_locations, users:user_list, room_passwords:room_pass, banned_users:banned_users});
            io.sockets.emit("display_users", {rooms_keys:Object.keys(room_list), users: Object.keys(user_list), user_locations:user_locations, user_locations_keys: Object.keys(user_locations), rooms:room_list});

            // notify user they've been banned
            let message = "You have been banned from " + room;
            io.to(banned_id).emit("message_to_client", { message: message, user: "System Admin"});
        }

        // if user is admin, tell them they can't ban people
        else {
            io.to(user_list[admin]).emit("message_to_client", { message: "You don't have the power to do that.", user: "System Admin", room: room });
        }
    });

    
});