"use strict";

const BigNumber = require('bignumber.js');
const ethers = require('ethers');

async function mineBlockNumber(blockNumber) {
  return rpc({method: 'evm_mineBlockNumber', params: [blockNumber]});
}

async function mineBlock() {
  return rpc({ method: 'evm_mine' });
}

async function increaseTime(seconds) {
  await rpc({ method: 'evm_increaseTime', params: [seconds] });
  return rpc({ method: 'evm_mine' });
}

async function setTime(seconds) {
  await rpc({ method: 'evm_setTime', params: [new Date(seconds * 1000)] });
}

async function freezeTime(seconds) {
  await rpc({ method: 'evm_freezeTime', params: [seconds] });
  return rpc({ method: 'evm_mine' });
}

async function advanceBlocks(blocks) {
  let { result: num } = await rpc({ method: 'eth_blockNumber' });
  await rpc({ method: 'evm_mineBlockNumber', params: [blocks + parseInt(num)] });
}

async function blockNumber() {
  let { result: num } = await rpc({ method: 'eth_blockNumber' });
  return parseInt(num);
}

async function minerStart() {
  return rpc({ method: 'miner_start' });
}

async function minerStop() {
  return rpc({ method: 'miner_stop' });
}

async function rpc(request) {
  return new Promise((okay, fail) => web3.currentProvider.send(request, (err, res) => err ? fail(err) : okay(res)));
}


module.exports = {
  advanceBlocks,
  blockNumber,
  freezeTime,
  increaseTime,
  mineBlock,
  mineBlockNumber,
  minerStart,
  minerStop,
  rpc,
  setTime,

  BigNumber
};