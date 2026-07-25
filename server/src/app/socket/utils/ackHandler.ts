import { TAckFn, TAckRes } from "@/app/socket/interface/socket.interface";

const ackHandler = (ack: TAckFn, data: TAckRes) => {
  if (typeof ack === "function") {
    ack(data);
  }
};

export default ackHandler;

