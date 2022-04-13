import { generateChildLogger, getLoggerContext } from "@walletconnect/logger";
import { IClient, IMessageTracker, MessageRecord } from "@walletconnect/types";
import {
  formatMessageContext,
  formatStorageKeyName,
  hashMessage,
  mapToObj,
  objToMap,
} from "@walletconnect/utils";
import { Logger } from "pino";
import { MESSAGES_CONTEXT, MESSAGES_STORAGE_VERSION } from "../constants";

export class MessageTracker extends IMessageTracker {
  public messages = new Map<string, MessageRecord>();

  public name = MESSAGES_CONTEXT;

  public version: string = MESSAGES_STORAGE_VERSION;

  constructor(public logger: Logger, public client: IClient) {
    super(logger, client);
    this.logger = generateChildLogger(logger, this.name);
    this.client = client;
  }

  get context(): string {
    return getLoggerContext(this.logger);
  }

  get storageKey(): string {
    return this.client.storagePrefix + this.version + "//" + formatStorageKeyName(this.context);
  }

  public async init(): Promise<void> {
    this.logger.trace(`Initialized`);
    await this.initialize();
  }

  public async set(topic: string, message: string): Promise<string> {
    const hash = await hashMessage(message);
    let messages = this.messages.get(topic);
    if (typeof messages === "undefined") {
      messages = {};
    }
    if (typeof messages[hash] !== "undefined") {
      return hash;
    }
    messages[hash] = message;
    this.messages.set(topic, messages);
    await this.persist();
    return hash;
  }

  public async get(topic: string): Promise<MessageRecord> {
    let messages = this.messages.get(topic);
    if (typeof messages === "undefined") {
      messages = {};
    }
    return messages;
  }

  public async has(topic: string, message: string): Promise<boolean> {
    const messages = this.get(topic);
    const hash = await hashMessage(message);
    return typeof messages[hash] !== "undefined";
  }

  public async del(topic: string) {
    this.messages.delete(topic);
    await this.persist();
  }

  // ---------- Private ----------------------------------------------- //

  private async setRelayerMessages(messages: Map<string, MessageRecord>): Promise<void> {
    await this.client.storage.setItem<Record<string, MessageRecord>>(
      this.storageKey,
      mapToObj(messages),
    );
  }

  private async getRelayerMessages(): Promise<Map<string, MessageRecord> | undefined> {
    const messages = await this.client.storage.getItem<Record<string, MessageRecord>>(
      this.storageKey,
    );
    return typeof messages !== "undefined" ? objToMap(messages) : undefined;
  }

  private async persist() {
    await this.setRelayerMessages(this.messages);
  }

  private async restore() {
    try {
      const messages = await this.getRelayerMessages();
      if (typeof messages !== "undefined") {
        this.messages = messages;
      }
      this.logger.debug(`Successfully Restored records for ${formatMessageContext(this.context)}`);
      this.logger.trace({ type: "method", method: "restore", size: this.messages.size });
    } catch (e) {
      this.logger.debug(`Failed to Restore records for ${formatMessageContext(this.context)}`);
      this.logger.error(e as any);
    }
  }

  private async initialize() {
    await this.restore();
  }
}
