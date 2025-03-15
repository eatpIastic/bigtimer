/// <reference types="../CTAutocomplete" />

import { getRoomData, rooms } from "../roomsAPI/utils/utils";
import Dungeon from "../BloomCore/dungeons/Dungeon";
import PogObject from "../PogData";

const customData = new PogObject("bigtimer", {}, "customCompletions.json");

const S02PacketChat = Java.type("net.minecraft.network.play.server.S02PacketChat");

const tabCompletions = [];

let currentRoom = null;

register("command", (...args) => {
    if (!args?.[0] || !args?.[1]) {
        ChatLib.chat(`Incorrect Usage. Example: /bigtimer Pirate 5`);
        return;
    }
    
    let room = args[0];
    let numSecrets = parseInt(args[1]);

    if (isNaN(numSecrets)) {
        ChatLib.chat(`Incorrect Usage. Example: /bigtimer Pirate 5`);
        return;
    }

    customData[room] = numSecrets;
    customData.save();
}).setName("bigtimer").setTabCompletions( (args) => {
    if (!args || args.length == 0 || args?.[0]?.trim() == "") {
        return tabCompletions;
    }

    let namesThatStartWith = [];

    tabCompletions.forEach(i => {
        if (i.startsWith((args[args.length - 1])?.toLowerCase())) {
            namesThatStartWith.push(i);
        }
    });

    return namesThatStartWith;
});

register("packetReceived", (packet, event) => {
    if (packet.func_179841_c() != 2 || !Dungeon.inDungeon) {
        return;
    }

    let unformattedText = packet.func_148915_c().text.removeFormatting();
    let secretMatch = unformattedText.match(/.+(\d+)\/(\d+) Secrets.*/);
    if (!secretMatch) {
        console.log("no secret match");
        return;
    }

    let secretsDone = parseInt(secretMatch[1]);
    let maxSecrets = parseInt(secretMatch[2]);

    if (secretsDone == 0) return;

    let roomName = getRoomData()?.name;
    
    if (!roomName) return;

    if (customData?.[roomName]) {
        maxSecrets = customData[roomName];
    }

    if (currentRoom != null && roomName != currentRoom.roomName) {
        currentRoom = null;
    }

    if (secretsDone == 1 && currentRoom == null && maxSecrets != 1) {
        currentRoom = new DungeonRoom(secretsDone, maxSecrets, roomName);
        console.log("started room");
    }

    if (currentRoom != null) {
        let done = currentRoom.checkCompleted(secretsDone);
        if (done) {
            currentRoom = null;
        }
    }
}).setFilteredClass(S02PacketChat);

class DungeonRoom {
    constructor(currentSecrets, maxSecrets, roomName) {
        this.currentSecrets = currentSecrets;
        this.maxSecrets = maxSecrets;
        this.roomName = roomName;
        this.startedAt = Date.now();
        console.log(`${this.currentSecrets}/${this.maxSecrets} ${this.roomName}`)
    }


    checkCompleted(secretsDone) {
        if (secretsDone >= this.maxSecrets) {
            ChatLib.chat(`&7> &b${this.roomName} &fdone in &b${this.formatTime()} &fseconds`);
        }

        return secretsDone >= this.maxSecrets;
    }

    formatTime() {
        let doneTime = Date.now() - this.startedAt;
        doneTime /= 1000;
        return `${(doneTime).toFixed(2)}`;
    }
}


const setupTabCompletion = () => {
    for (let i = 0; i < rooms.length; i++) {
        tabCompletions.push(rooms[i].name);
    }
}

setupTabCompletion();