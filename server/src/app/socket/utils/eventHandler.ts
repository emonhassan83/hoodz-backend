// src/app/socket/utils/eventHandler.ts
import { TAckFn, TSocket, TSocketHandler } from "@/app/socket/interface/socket.interface";
import { handleSocketError } from "@/app/socket/utils/handleSocketError";

const eventHandler = <TData = any>(handler: TSocketHandler<TData>) => {
  return async function (this: TSocket, data: TData, ack?: TAckFn) {
    try {
      if (!this || typeof this.emit !== 'function') {
        console.error('❌ Invalid socket context in eventHandler');
        return;
      }

      console.log(`🔧 eventHandler executing for event with ack type: ${typeof ack}`);

      await handler(this, data, ack);
    } catch (err: unknown) {
      console.error('❌ Error caught in eventHandler:', err);
      if (this && typeof this.emit === 'function') {
        handleSocketError(err, this, ack);
      }
    }
  };
};

export default eventHandler;
