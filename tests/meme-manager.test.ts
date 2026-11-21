import assert from 'node:assert/strict';
import test from 'node:test';
import { type Channel, Collection, type Message, TextChannel } from 'discord.js';
import { Effect } from 'effect';

import { MEME_CHANNEL_NAME } from '../src/features/meme/MemeDomain.js';
import {
    fetchMessagesInRange,
    resolveContestChannel,
    snowflakeBefore,
} from '../src/features/meme/MemeManager.js';

const textChannel = (id: string, name: string): TextChannel =>
    Object.assign(Object.create(TextChannel.prototype), { id, name });

const channels = (...list: Channel[]) =>
    new Collection<string, Channel>(list.map(channel => [channel.id, channel]));

test('weekly contests fall back to the meme channel when the stored channel is gone', () => {
    const memes = textChannel('1', MEME_CHANNEL_NAME);
    const general = textChannel('2', 'general');

    assert.equal(resolveContestChannel(channels(memes, general), '2'), general);
    assert.equal(resolveContestChannel(channels(memes, general), '999'), memes);
    assert.equal(resolveContestChannel(channels(memes, general)), memes);
    assert.equal(resolveContestChannel(channels(general), '999'), undefined);
});

test('message history is paged forward with after until the window ends', async () => {
    const start = new Date('2026-10-16T17:00:00.000Z');
    const end = new Date('2026-10-23T17:00:00.000Z');
    const minute = 60_000;
    const all = Array.from({ length: 250 }, (_, index) => {
        const createdAt = new Date(start.getTime() - 5 * minute + index * 60 * minute);
        return { id: (BigInt(snowflakeBefore(createdAt)) + 1n).toString(), createdAt };
    });
    const calls: string[] = [];
    const channel = {
        messages: {
            fetch: async ({ after, limit }: { after: string; limit: number }) => {
                calls.push(after);
                const page = all
                    .filter(message => BigInt(message.id) > BigInt(after))
                    .slice(0, limit)
                    .reverse();
                return new Collection(page.map(message => [message.id, message as Message]));
            },
        },
    } as unknown as Pick<TextChannel, 'messages'>;

    const messages = await Effect.runPromise(fetchMessagesInRange(channel, start, end));
    const expected = all.filter(message => message.createdAt >= start && message.createdAt < end);

    assert.equal(messages.length, expected.length);
    assert.deepEqual(
        messages.map(message => message.id).sort(),
        expected.map(message => message.id).sort()
    );
    assert.equal(calls[0], snowflakeBefore(start));
    assert.equal(calls.length, 2);
});
