document.addEventListener('DOMContentLoaded', () => {
  const socket = new WebSocket('ws://localhost:3000');
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    console.log('データ更新:', data);
  });
});
