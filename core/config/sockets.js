module.exports = {
  connection: (socket) => {
    console.log('A User Connected');
    socket.on('disconnect', () => {
      console.log('A User Disconnected');
    });
    socket.on('message', (msg) => {
      console.log(msg);
    });
  },
};