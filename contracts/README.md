# contracts

Foundry project for the two on-chain pieces:

- `AttestationRegistry.sol` — probe results (delivery, honesty, latency, Hedera payment ref) written by whitelisted probers, keyed by ENS labelhash.
- `ServiceRegistrar.sol` — subname registrar for `agentindex.eth` on ENSv2, adapted from the [ENS contract-developer tutorial](https://docs.ens.domains/ensv2/tutorial-contract-developers). Expiring registrations, registrar-held revocation (`delist`) for services caught defrauding probers.

## Setup

```sh
forge install --no-git OpenZeppelin/openzeppelin-contracts ensdomains/contracts-v2
forge build
forge test
```

## Deploy (Sepolia)

```sh
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast
```

Required env: `DEPLOYER_PRIVATE_KEY`, `PROBER_ADDRESS`, `ENS_REGISTRY_ADDRESS` (the ENSv2 PermissionedRegistry our parent name points at), optional `FEE_TOKEN_ADDRESS`.

After deploying, the registry admin must grant the registrar root roles
(`ROLE_REGISTRAR | ROLE_RENEW | ROLE_UNREGISTER`) via `grantRootRoles()`.

Scripts are re-runnable from scratch — testnets reset, so never assume prior state.
