import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consensusPosition, median, summarize } from '../src/stats.js';

test('median of odd and even sample', () => {
  assert.equal(median([0, 1, 4]), 1);
  assert.equal(median([0, 1, 2, 4]), 1.5);
  assert.equal(median([]), null);
});

test('consensus tier on a .5 median follows the mean', () => {
  assert.equal(consensusPosition(1.5, 1.2), 1);
  assert.equal(consensusPosition(1.5, 2.1), 2);
  assert.equal(consensusPosition(1.5, 1.5), 1); // exact tie → better tier
  assert.equal(consensusPosition(2, 0.3), 2);
});

test('summarize builds distribution and stats', () => {
  const s = summarize(4, [3, 0, 1, 1]);
  assert.deepEqual(s.distribution, [1, 2, 0, 1]);
  assert.equal(s.votes, 4);
  assert.equal(s.median, 1);
  assert.equal(s.mean, 1.25);
  assert.equal(s.position, 1);
  assert.equal(s.min, 0);
  assert.equal(s.max, 3);
});

test('summarize without votes is unrated', () => {
  const s = summarize(3, []);
  assert.equal(s.position, null);
  assert.deepEqual(s.distribution, [0, 0, 0]);
});
