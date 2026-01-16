import http from "http";
import { exec } from "child_process";

const PORT = 9000;

http.createServer((req, res) => {
  if (req.method === "POST") {
    exec("/root/bot-git/webhook.sh", (err, stdout, stderr) => {
      console.log("DEPLOY TRIGGERED");
      if (err) console.error(err);
      if (stderr) console.error(stderr);
      console.log(stdout);
    });
    res.writeHead(200);
    res.end("OK\n");
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, () => {
  console.log("Webhook server listening on port " + PORT);
});
