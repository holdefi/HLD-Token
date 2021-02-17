const {
  minerStart,
  minerStop,
  mineBlock,
  increaseTime,
  BigNumber
} = require('./Utils/Ethereum');

const EIP712 = require('./Utils/EIP712');
const {expectRevert} = require('@openzeppelin/test-helpers');
const HLDContract = artifacts.require("HLD");


contract("HLD Token", function([root, a1, a2, a3]){

  describe('HLD', () => {
    const initial_mint = new BigNumber(100000000000000000000000000);
    const name = 'Holdefi Token';
    const symbol = 'HLD';
    const version = "1";

    let HLD, chainId;

    beforeEach(async () => {
      HLD =  await HLDContract.new({from: root});
      chainId = "1"; // await web3.eth.net.getId(); See: https://github.com/trufflesuite/ganache-core/issues/515

    });

    describe('metadata', () => {
      it('has given name', async () => {
        assert.equal((await HLD.name()).toString(), name);
      });

      it('has given symbol', async () => {
        assert.equal((await HLD.symbol()).toString(), symbol);
      });
    });

    describe('balanceOf', () => {
      it('grants to initial account', async () => {
        assert.equal(new BigNumber(await HLD.balanceOf(root)).toString(), initial_mint.toString());
      });
    });

    describe('delegateBySig', () => {
      const Domain = (HLD) => ({ name, version, chainId, verifyingContract: HLD.address });
      const Types = {
        Delegation: [
          { name: 'delegator', type: 'address' },
          { name: 'delegatee', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' }
        ]
      };

      it('reverts if the signatory is invalid', async () => {
        let new_account = web3.eth.accounts.create();
        const delegatee = root, delegator = new_account.address, nonce = 0, expiry = 10e9;
        await expectRevert(HLD.delegateBySig(delegator, delegatee, expiry, 28, '0xbad', '0xbad'), "ECDSA: invalid signature");
      });

      it('reverts if the delegator not match ', async () => {
        let new_account = web3.eth.accounts.create();
        const delegatee = root, delegator = new_account.address, nonce = 0, expiry = 10e9;
        const { v, r, s } = EIP712.sign(Domain(HLD), 'Delegation', { delegator, delegatee, nonce, expiry }, Types, new_account.privateKey);
        await expectRevert(HLD.delegateBySig(a1, delegatee, expiry, v, r, s), "HLD::delegateBySig: invalid signature");
      });

      it('reverts if the nonce is bad ', async () => {
        let new_account = web3.eth.accounts.create();
        const delegatee = root, delegator = new_account.address, nonce = 1, expiry = 10e9;
        const { v, r, s } = EIP712.sign(Domain(HLD), 'Delegation', { delegator, delegatee, nonce, expiry }, Types, new_account.privateKey);
        await expectRevert(HLD.delegateBySig(delegator, delegatee, expiry, v, r, s), "HLD::delegateBySig: invalid signature");
      });

      it('reverts if the signature has expired', async () => {
        let new_account = web3.eth.accounts.create();
        const delegatee = root, delegator = new_account.address, nonce = 0, expiry =  0;
        const { v, r, s } = EIP712.sign(Domain(HLD), 'Delegation', { delegator, delegatee, nonce, expiry }, Types, new_account.privateKey);
        await expectRevert(HLD.delegateBySig(delegator, delegatee, expiry, v, r, s), "HLD::delegateBySig: signature expired");
      });

      it('delegates on behalf of the signatory', async () => {
        let new_account = web3.eth.accounts.create();
        const delegatee = root, delegator = new_account.address, nonce = 0, expiry = 10e9;

        const { v, r, s } = EIP712.sign(Domain(HLD), 'Delegation', { delegator, delegatee, nonce, expiry }, Types, new_account.privateKey);
        assert.equal(await HLD.delegates(new_account.address), "0x0000000000000000000000000000000000000000");

        const tx = await HLD.delegateBySig(delegator, delegatee, expiry, v, r, s);
        assert.isTrue(tx.receipt.gasUsed < 80000);
        assert.equal(await HLD.delegates(new_account.address), root);
      });
    });

    describe('numCheckpoints', () => {
      it('returns the number of checkpoints for a delegate', async () => {
        let guy = a3;
        await HLD.transfer(guy, '100'); //give an account a few tokens for readability
        assert.equal(await HLD.numCheckpoints(a1), '0');

        const t1 = await HLD.delegate(a1, { from: guy });
        assert.equal(await HLD.numCheckpoints(a1), '1');

        const t2 = await HLD.transfer(a2, 10, { from: guy });
        assert.equal(await HLD.numCheckpoints(a1), '2');

        const t3 = await HLD.transfer(a2, 10, { from: guy });
        assert.equal(await HLD.numCheckpoints(a1), '3');

        const t4 = await HLD.transfer(guy, 20, { from: root });
        assert.equal(await HLD.numCheckpoints(a1), '4');

        let checkpoint1 = await HLD.checkpoints(a1, 0);
        assert.equal(checkpoint1.fromBlock, t1.receipt.blockNumber.toString());
        assert.equal(checkpoint1.votes, '100');

        let checkpoint2 = await HLD.checkpoints(a1, 1);
        assert.equal(checkpoint2.fromBlock, t2.receipt.blockNumber.toString());
        assert.equal(checkpoint2.votes, '90');

        let checkpoint3 = await HLD.checkpoints(a1, 2);
        assert.equal(checkpoint3.fromBlock, t3.receipt.blockNumber.toString());
        assert.equal(checkpoint3.votes, '80');

        let checkpoint4 = await HLD.checkpoints(a1, 3);
        assert.equal(checkpoint4.fromBlock, t4.receipt.blockNumber.toString());
        assert.equal(checkpoint4.votes, '100');
      });

      it('does not add more than one checkpoint in a block', async () => {
        let guy = a3;

        await HLD.transfer(guy, 100); //give an account a few tokens for readability
        assert.equal(await HLD.numCheckpoints(a1), '0');
        await minerStop();

        let t1 = HLD.delegate(a1, { from: guy, gas:500000 });
        let t2 = HLD.transfer(a2, 10, { from: guy, gas:500000 });
        let t3 = HLD.transfer(a2, 10, { from: guy, gas:500000 });

        await minerStart();

        t1 = await t1;
        t2 = await t2;
        t3 = await t3;

        assert.equal(new BigNumber(await HLD.numCheckpoints(a1)).toString(), '1');

        let checkpoint1 = await HLD.checkpoints(a1, 0);
        assert.equal(new BigNumber(checkpoint1.fromBlock).toString(), t1.receipt.blockNumber.toString());
        assert.equal(new BigNumber(checkpoint1.votes).toString(), '80');

        let checkpoint2 = await HLD.checkpoints(a1, 1);
        assert.equal(new BigNumber(checkpoint2.fromBlock).toString(), '0');
        assert.equal(new BigNumber(checkpoint2.votes).toString(), '0');

        let checkpoint3 = await HLD.checkpoints(a1, 2);
        assert.equal(new BigNumber(checkpoint3.fromBlock).toString(), '0');
        assert.equal(new BigNumber(checkpoint3.votes).toString(), '0');

        let t4 = await HLD.transfer(guy, 20, { from: root });
        assert.equal(new BigNumber(await HLD.numCheckpoints(a1)).toString(), '2');

        let checkpoint = await HLD.checkpoints(a1, 1);
        assert.equal(new BigNumber(checkpoint.fromBlock).toString(), t4.receipt.blockNumber.toString());
        assert.equal(new BigNumber(checkpoint.votes).toString(), '100');
      });
    });

    describe('getPriorVotes', () => {
      it('reverts if block number >= current block', async () => {
        await expectRevert(HLD.getPriorVotes(a1, 5e10), "revert HLD::getPriorVotes: not yet determined")
      });

      it('returns 0 if there are no checkpoints', async () => {
        assert.equal(await HLD.getPriorVotes(a1, 0), '0');
      });

      it('returns the latest block if >= last checkpoint block', async () => {
        const t1 = await HLD.delegate(a1, { from: root });
        await mineBlock();
        await mineBlock();

        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t1.receipt.blockNumber)).toString(), initial_mint.toString());
        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t1.receipt.blockNumber + 1)).toString(), initial_mint.toString());
      });

      it('returns zero if < first checkpoint block', async () => {
        await mineBlock();
        const t1 = await HLD.delegate(a1, { from: root });
        await mineBlock();
        await mineBlock();

        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t1.receipt.blockNumber - 1)).toString(), '0');
        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t1.receipt.blockNumber + 1)).toString(), initial_mint.toString());
      });

      it('generally returns the voting balance at the appropriate checkpoint', async () => {
        const t1 = await HLD.delegate(a1, { from: root });
        await mineBlock();
        await mineBlock();
        const t2 = await HLD.transfer(a2, 10, { from: root });
        await mineBlock();
        await mineBlock();
        const t3 = await HLD.transfer(a2, 10, { from: root });
        await mineBlock();
        await mineBlock();
        const t4 = await HLD.transfer(root, 20, { from: a2 });
        await mineBlock();
        await mineBlock();

        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t1.receipt.blockNumber - 1)).toString(), '0');

        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t1.receipt.blockNumber)).toString(), initial_mint.toString());
        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t1.receipt.blockNumber + 1)).toString(), initial_mint.toString());
        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t2.receipt.blockNumber)).toString(), initial_mint.minus(10).toString());
        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t2.receipt.blockNumber + 1)).toString(), initial_mint.minus(10).toString());
        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t3.receipt.blockNumber)).toString(), initial_mint.minus(20).toString());
        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t3.receipt.blockNumber + 1)).toString(), initial_mint.minus(20).toString());
        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t4.receipt.blockNumber)).toString(), initial_mint.toString());
        assert.equal(new BigNumber(await HLD.getPriorVotes(a1, t4.receipt.blockNumber + 1)).toString(), initial_mint.toString());
      });
    });
  });
});