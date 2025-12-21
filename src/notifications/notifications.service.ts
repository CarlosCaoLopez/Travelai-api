import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

@Injectable()
export class NotificationsService {
  private expo: Expo;
  private readonly logger = new Logger(NotificationsService.name);

  constructor() {
    this.expo = new Expo();
  }

  async sendPushNotifications(
    tokens: string[],
    title: string,
    body: string,
    data?: any,
  ): Promise<void> {
    const messages: ExpoPushMessage[] = [];

    for (const token of tokens) {
      if (!Expo.isExpoPushToken(token)) {
        this.logger.warn(`Push token ${token} is not a valid Expo push token`);
        continue;
      }

      messages.push({
        to: token,
        sound: 'default',
        title,
        body,
        data,
      });
    }

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        this.logger.error('Error sending push notifications chunk', error);
      }
    }

    // Handle receipts logic if needed, but for now we just log errors from tickets
    // Note: To check delivery status we would need to fetch receipts later using ticket IDs
    // For this implementation we just check if the initial send request was successful
    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        this.logger.error(
          `Error sending notification: ${ticket.message}`,
          ticket.details && JSON.stringify(ticket.details),
        );
      }
    }
  }
}
