const fs = require('fs');
const path = require('path');

const pinsFile = path.join(__dirname, '..', 'pins.json');

// pins.jsonを読み込む関数
function loadPins() {
  try {
    const data = fs.readFileSync(pinsFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

// pins.jsonを保存する関数
function savePins(pins) {
  fs.writeFileSync(pinsFile, JSON.stringify(pins, null, 2));
}

module.exports = { loadPins, savePins };
