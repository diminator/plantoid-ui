import { Button, Col, Menu, Row, Input, Divider, List } from "antd";
import "antd/dist/antd.css";
import {
  useBalance,
  useContractLoader,
  useContractReader,
  useGasPrice,
  useOnBlock,
  useUserProviderAndSigner,
} from "eth-hooks";
import { useExchangeEthPrice } from "eth-hooks/dapps/dex";
import React, { useCallback, useEffect, useState } from "react";
import { Link, Route, Switch, useLocation } from "react-router-dom";
import "./App.css";
import {
  Account,
  Contract,
  Address,
  Faucet,
  GasGauge,
  Header,
  Ramp,
  ThemeSwitch,
  NetworkDisplay,
  FaucetHint,
  NetworkSwitch,
  AddressInput,
  EtherInput,
  BytesStringInput,
} from "./components";
import { NETWORKS, ALCHEMY_KEY } from "./constants";
import externalContracts from "./contracts/external_contracts";
import GnosisSafeABI from "./contracts/gnosisSafe";
import MultisendABI from "./contracts/multisend";
import TipRelayerABI from "./contracts/relayer";
import SignatureDbABI from "./contracts/signaturedb";
// contracts
import deployedContracts from "./contracts/hardhat_contracts.json";
import { Transactor, Web3ModalSetup } from "./helpers";
import { Home, ExampleUI, Hints, Subgraph } from "./views";
import { useStaticJsonRPC } from "./hooks";
import { ZERO_ADDRESS } from "./components/Swap";

import { safeSignTypedData, encodeMultiSend, MetaTransaction } from "@gnosis.pm/safe-contracts";

const { ethers } = require("ethers");
/*
    Welcome to 🏗 scaffold-eth !

    Code:
    https://github.com/scaffold-eth/scaffold-eth

    Support:
    https://t.me/joinchat/KByvmRe5wkR-8F_zz6AjpA
    or DM @austingriffith on twitter or telegram

    You should get your own Alchemy.com & Infura.io ID and put it in `constants.js`
    (this is your connection to the main Ethereum network for ENS etc.)


    🌏 EXTERNAL CONTRACTS:
    You can also bring in contract artifacts in `constants.js`
    (and then use the `useExternalContractLoader()` hook!)
*/

/// 📡 What chain are your contracts deployed to?
const initialNetwork = NETWORKS.rinkeby; // <------- select your target frontend network (localhost, rinkeby, xdai, mainnet)

// 😬 Sorry for all the console logging
const DEBUG = true;
const NETWORKCHECK = true;
const USE_BURNER_WALLET = false; // toggle burner wallet feature
const USE_NETWORK_SELECTOR = false;

const web3Modal = Web3ModalSetup();

// 🛰 providers
const providers = [
  "https://eth-mainnet.gateway.pokt.network/v1/lb/611156b4a585a20035148406",
  `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`,
  "https://rpc.scaffoldeth.io:48544",
];

const encodeMultiAction = (multisend, metatransactions) => {
  console.log({ metatransactions });
  const encodedMetatransactions = encodeMultiSend(metatransactions);
  const multi_action = multisend.interface.encodeFunctionData("multiSend", [encodedMetatransactions]);
  return multi_action;
};

function App(props) {
  // specify all the chains your app is available on. Eg: ['localhost', 'mainnet', ...otherNetworks ]
  // reference './constants.js' for other networks
  const networkOptions = [initialNetwork.name, "mainnet", "rinkeby"];

  const [injectedProvider, setInjectedProvider] = useState();
  const [address, setAddress] = useState();
  const [toAddress, setToAddress] = useState();
  const [gnosisAddress, setGnosisAddress] = useState();
  const [txData, setTxData] = useState();
  const [txComment, setTxComment] = useState();
  const [txs, setTxs] = useState([]);
  const [txValue, setTxValue] = useState();
  const [signatures, setSignatures] = useState([]);
  const [encodedTx, setEncodedTx] = useState();
  const [multisendAction, setMultisendAction] = useState();
  const [txHash, setTxHash] = useState();
  const [tipValue, setTipValue] = useState();
  const [selectedNetwork, setSelectedNetwork] = useState(networkOptions[0]);
  const location = useLocation();

  const addTx = async () => {
    const newTxs = [...txs];
    newTxs.push({
      to: toAddress,
      data: txData,
      value: txValue,
      operation: 0,
    });
    console.log({ newTxs });
    setTxs(newTxs);
  };

  const encodeTransaction = (
    to,
    value,
    data,
    operation,
    safeTxGas,
    baseGas,
    gasPrice,
    gasToken,
    refundReceiver,
    nonce,
    comment,
  ) => {
    return ethers.utils.defaultAbiCoder.encode(
      [
        "address",
        "uint256",
        "bytes",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "address",
        "address",
        "uint256",
        "string",
      ],
      [to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonce, comment],
    );
  };

  const submitSignature = async () => {
    try {
      console.log({ gnosisAddress, txHash, encodedTx, signatures });
      await writeContracts.SignatureDb.addSignatures(gnosisAddress, txHash, signatures[0]);
    } catch (error) {
      console.log({ error });
    }
  };

  const execWithSignatures = async () => {
    const gnosisSafe = new ethers.Contract(gnosisAddress, GnosisSafeABI, userSigner);

    try {
      await gnosisSafe.execTransaction(
        "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761",
        0,
        multisendAction,
        1,
        0,
        0,
        0,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        signatures[0],
      );
    } catch (error) {
      console.log({ error });
    }
  };

  const createAndSign = async () => {
    const gnosisAddressChecksum = ethers.utils.getAddress(gnosisAddress);
    const toAddressChecksum = ethers.utils.getAddress(toAddress);
    console.log({ gnosisAddress, gnosisAddressChecksum, toAddress, toAddressChecksum });
    try {
      const multisendContract = new ethers.Contract(
        "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761",
        MultisendABI,
        localProvider,
      );
      // TODO fix address
      const relayerContract = new ethers.Contract(
        "0xda945d66170849d6eef90df09cd1f235d83efa66", // Rinkeby
        TipRelayerABI,
        localProvider,
      );
      const gnosisSafe = new ethers.Contract(gnosisAddressChecksum, GnosisSafeABI, localProvider);

      txs.push({
        to: relayerContract.address,
        data: "0x",
        value: ethers.utils.parseEther(tipValue),
        operation: 0,
      });

      const nonce = await gnosisSafe.nonce();

      const multisendAction = encodeMultiAction(multisendContract, txs);

      console.log({ nonce, multisendAction });

      // todo abi encode the arguments into bytes for storage

      const abiEncoded = encodeTransaction(
        multisendContract.address,
        0,
        multisendAction,
        1,
        0,
        0,
        0,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        nonce,
        txComment,
      );

      setEncodedTx(abiEncoded);
      setMultisendAction(multisendAction);
      const newTxHash = await gnosisSafe.callStatic.getTransactionHash(
        multisendContract.address,
        0,
        multisendAction,
        1,
        0,
        0,
        0,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        nonce,
      );
      setTxHash(newTxHash);
      console.log({ newTxHash, abiEncoded });
      const signed = await safeSignTypedData(userSigner, gnosisSafe, {
        to: multisendContract.address,
        value: 0,
        data: multisendAction,
        operation: 1,
        safeTxGas: 0,
        baseGas: 0,
        gasPrice: 0,
        gasToken: ZERO_ADDRESS,
        refundReceiver: ZERO_ADDRESS,
        nonce,
      });
      const newSigs = [...signatures];
      newSigs.push(signed.data);
      console.log({ newSigs });
      setSignatures(newSigs);
    } catch (error) {
      console.log({ error });
    }
  };

  const targetNetwork = NETWORKS[selectedNetwork];

  // 🔭 block explorer URL
  const blockExplorer = targetNetwork.blockExplorer;

  // load all your providers
  const localProvider = useStaticJsonRPC([
    process.env.REACT_APP_PROVIDER ? process.env.REACT_APP_PROVIDER : targetNetwork.rpcUrl,
  ]);
  const mainnetProvider = useStaticJsonRPC(providers);

  if (DEBUG) console.log(`Using ${selectedNetwork} network`);

  // 🛰 providers
  if (DEBUG) console.log("📡 Connecting to Mainnet Ethereum");

  const logoutOfWeb3Modal = async () => {
    await web3Modal.clearCachedProvider();
    if (injectedProvider && injectedProvider.provider && typeof injectedProvider.provider.disconnect == "function") {
      await injectedProvider.provider.disconnect();
    }
    setTimeout(() => {
      window.location.reload();
    }, 1);
  };

  /* 💵 This hook will get the price of ETH from 🦄 Uniswap: */
  const price = useExchangeEthPrice(targetNetwork, mainnetProvider);

  /* 🔥 This hook will get the price of Gas from ⛽️ EtherGasStation */
  const gasPrice = useGasPrice(targetNetwork, "fast");
  // Use your injected provider from 🦊 Metamask or if you don't have it then instantly generate a 🔥 burner wallet.
  const userProviderAndSigner = useUserProviderAndSigner(injectedProvider, localProvider, USE_BURNER_WALLET);
  const userSigner = userProviderAndSigner.signer;

  useEffect(() => {
    async function getAddress() {
      if (userSigner) {
        const newAddress = await userSigner.getAddress();
        setAddress(newAddress);
      }
    }
    getAddress();
  }, [userSigner]);

  // You can warn the user if you would like them to be on a specific network
  const localChainId = localProvider && localProvider._network && localProvider._network.chainId;
  const selectedChainId =
    userSigner && userSigner.provider && userSigner.provider._network && userSigner.provider._network.chainId;

  // For more hooks, check out 🔗eth-hooks at: https://www.npmjs.com/package/eth-hooks

  // The transactor wraps transactions and provides notificiations
  const tx = Transactor(userSigner, gasPrice);

  // 🏗 scaffold-eth is full of handy hooks like this one to get your balance:
  const yourLocalBalance = useBalance(localProvider, address);

  // Just plug in different 🛰 providers to get your balance on different chains:
  const yourMainnetBalance = useBalance(mainnetProvider, address);

  // const contractConfig = useContractConfig();

  const contractConfig = { deployedContracts: deployedContracts || {}, externalContracts: externalContracts || {} };

  // Load in your local 📝 contract and read a value from it:
  const readContracts = useContractLoader(localProvider, contractConfig);

  // If you want to make 🔐 write transactions to your contracts, use the userSigner:
  const writeContracts = useContractLoader(userSigner, contractConfig, localChainId);

  // EXTERNAL CONTRACT EXAMPLE:
  //
  // If you want to bring in the mainnet DAI contract it would look like:
  const mainnetContracts = useContractLoader(mainnetProvider, contractConfig);

  // If you want to call a function on a new block
  useOnBlock(mainnetProvider, () => {
    console.log(`⛓ A new mainnet block is here: ${mainnetProvider._lastBlockNumber}`);
  });

  // Then read your DAI balance like:
  const myMainnetDAIBalance = useContractReader(mainnetContracts, "DAI", "balanceOf", [
    "0x34aA3F359A9D614239015126635CE7732c18fDF3",
  ]);

  // keep track of a variable from the contract in the local React state:
  const purpose = useContractReader(readContracts, "YourContract", "purpose");

  /*
  const addressFromENS = useResolveName(mainnetProvider, "austingriffith.eth");
  console.log("🏷 Resolved austingriffith.eth as:",addressFromENS)
  */

  //
  // 🧫 DEBUG 👨🏻‍🔬
  //
  useEffect(() => {
    if (
      DEBUG &&
      mainnetProvider &&
      address &&
      selectedChainId &&
      yourLocalBalance &&
      yourMainnetBalance &&
      readContracts &&
      writeContracts &&
      mainnetContracts
    ) {
      console.log("_____________________________________ 🏗 scaffold-eth _____________________________________");
      console.log("🌎 mainnetProvider", mainnetProvider);
      console.log("🏠 localChainId", localChainId);
      console.log("👩‍💼 selected address:", address);
      console.log("🕵🏻‍♂️ selectedChainId:", selectedChainId);
      console.log("💵 yourLocalBalance", yourLocalBalance ? ethers.utils.formatEther(yourLocalBalance) : "...");
      console.log("💵 yourMainnetBalance", yourMainnetBalance ? ethers.utils.formatEther(yourMainnetBalance) : "...");
      console.log("📝 readContracts", readContracts);
      console.log("🌍 DAI contract on mainnet:", mainnetContracts);
      console.log("💵 yourMainnetDAIBalance", myMainnetDAIBalance);
      console.log("🔐 writeContracts", writeContracts);
    }
  }, [
    mainnetProvider,
    address,
    selectedChainId,
    yourLocalBalance,
    yourMainnetBalance,
    readContracts,
    writeContracts,
    mainnetContracts,
    localChainId,
    myMainnetDAIBalance,
  ]);

  const loadWeb3Modal = useCallback(async () => {
    const provider = await web3Modal.connect();
    setInjectedProvider(new ethers.providers.Web3Provider(provider));

    provider.on("chainChanged", chainId => {
      console.log(`chain changed to ${chainId}! updating providers`);
      setInjectedProvider(new ethers.providers.Web3Provider(provider));
    });

    provider.on("accountsChanged", () => {
      console.log(`account changed!`);
      setInjectedProvider(new ethers.providers.Web3Provider(provider));
    });

    // Subscribe to session disconnection
    provider.on("disconnect", (code, reason) => {
      console.log(code, reason);
      logoutOfWeb3Modal();
    });
    // eslint-disable-next-line
  }, [setInjectedProvider]);

  useEffect(() => {
    if (web3Modal.cachedProvider) {
      loadWeb3Modal();
    }
  }, [loadWeb3Modal]);

  const faucetAvailable = localProvider && localProvider.connection && targetNetwork.name.indexOf("local") !== -1;

  return (
    <div className="App">
      {/* ✏️ Edit the header and change the title to your project name */}
      <Header
        title="🎩 Multisig Mempool"
        link="https://github.com/wpapper/multisig-mempool/"
        subTitle="Store pending multisig transactions on L2s"
      >
        {/* 👨‍💼 Your account is in the top right with a wallet at connect options */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flex: 1 }}>
            {USE_NETWORK_SELECTOR && (
              <div style={{ marginRight: 20 }}>
                <NetworkSwitch
                  networkOptions={networkOptions}
                  selectedNetwork={selectedNetwork}
                  setSelectedNetwork={setSelectedNetwork}
                />
              </div>
            )}
            <Account
              useBurner={USE_BURNER_WALLET}
              address={address}
              localProvider={localProvider}
              userSigner={userSigner}
              mainnetProvider={mainnetProvider}
              price={price}
              web3Modal={web3Modal}
              loadWeb3Modal={loadWeb3Modal}
              logoutOfWeb3Modal={logoutOfWeb3Modal}
              blockExplorer={blockExplorer}
            />
          </div>
        </div>
      </Header>
      {yourLocalBalance.lte(ethers.BigNumber.from("0")) && (
        <FaucetHint localProvider={localProvider} targetNetwork={targetNetwork} address={address} />
      )}
      <NetworkDisplay
        NETWORKCHECK={NETWORKCHECK}
        localChainId={localChainId}
        selectedChainId={selectedChainId}
        targetNetwork={targetNetwork}
        logoutOfWeb3Modal={logoutOfWeb3Modal}
        USE_NETWORK_SELECTOR={USE_NETWORK_SELECTOR}
      />
      <Menu style={{ textAlign: "center", marginTop: 20 }} selectedKeys={[location.pathname]} mode="horizontal">
        <Menu.Item key="/">
          <Link to="/">Tx Builder</Link>
        </Menu.Item>
        <Menu.Item key="/sign">
          <Link to="/sign">Sign</Link>
        </Menu.Item>
      </Menu>

      <Switch>
        <Route exact path="/">
          {/* pass in any web3 props to this Home component. For example, yourLocalBalance */}
          <div>
            <div style={{ border: "1px solid #cccccc", padding: 16, width: 400, margin: "auto", marginTop: 64 }}>
              <h2>Tx Builder:</h2>
              <Divider />
              <div style={{ margin: 8 }}></div>
              Gnosis Safe
              <AddressInput onChange={setGnosisAddress} value={gnosisAddress}></AddressInput>
              <Divider />
              To
              <AddressInput onChange={setToAddress} value={toAddress}></AddressInput>
              Data
              <Input onChange={e => setTxData(e.target.value)} value={txData}></Input>
              Value
              <EtherInput onChange={setTxValue} value={txValue} price={price}></EtherInput>
              <Divider />
              <Button
                onClick={() => {
                  /* look how we call setPurpose AND send some value along */
                  addTx();
                  /* this will fail until you make the setPurpose function payable */
                }}
              >
                Add transaction
              </Button>
              <Divider />
              Tip
              <EtherInput onChange={setTipValue} value={tipValue} price={price}></EtherInput>
              <Divider />
              Comments
              <Input onChange={e => setTxComment(e.target.value)} value={txComment}></Input>
              <Divider />
              <Button
                onClick={() => {
                  createAndSign();
                }}
              >
                Sign transactions
              </Button>
              <Button
                onClick={() => {
                  /* look how we call setPurpose AND send some value along */
                  submitSignature();
                  /* this will fail until you make the setPurpose function payable */
                }}
              >
                Save transactions
              </Button>
              <Button
                onClick={() => {
                  execWithSignatures();
                }}
              >
                Exec transactions
              </Button>
            </div>
            <div style={{ width: 600, margin: "auto", marginTop: 32, paddingBottom: 32 }}>
              <h2>Txs:</h2>
              <List
                bordered
                dataSource={txs}
                renderItem={item => {
                  return (
                    <List.Item key={(Math.random() + 1).toString(36).substring(7)}>
                      <Address address={item.to} ensProvider={mainnetProvider} fontSize={16} />
                      {item.data.slice(0, 15)}...
                    </List.Item>
                  );
                }}
              />
            </div>
          </div>
        </Route>
        <Route exact path="/sign">
          {/* pass in any web3 props to this Home component. For example, yourLocalBalance */}
          <div>
            <div style={{ border: "1px solid #cccccc", padding: 16, width: 400, margin: "auto", marginTop: 64 }}>
              <h2>Tx Signer:</h2>
              <Divider />
              <div style={{ margin: 8 }}></div>
              Gnosis Safe
              <AddressInput onChange={setGnosisAddress} value={gnosisAddress}></AddressInput>
              TX Hash
              <Input onChange={e => setTxHash(e.target.value)} value={txData}></Input>
              <Divider />
              <Button
                onClick={() => {
                  /* look how we call setPurpose AND send some value along */
                  addTx();
                  /* this will fail until you make the setPurpose function payable */
                }}
              >
                Load transaction
              </Button>
              <Divider />
              Comments
              <Input onChange={e => setTxComment(e.target.value)} value={txComment}></Input>
              <Divider />
              <Button
                onClick={() => {
                  /* look how we call setPurpose AND send some value along */
                  createAndSign();
                  /* this will fail until you make the setPurpose function payable */
                }}
              >
                Sign transactions
              </Button>
              <Button
                onClick={() => {
                  /* look how we call setPurpose AND send some value along */
                  submitSignature();
                  /* this will fail until you make the setPurpose function payable */
                }}
              >
                Save transactions
              </Button>
            </div>
            <div style={{ width: 600, margin: "auto", marginTop: 32, paddingBottom: 32 }}>
              <h2>Txs:</h2>
              <List
                bordered
                dataSource={txs}
                renderItem={item => {
                  return (
                    <List.Item key={(Math.random() + 1).toString(36).substring(7)}>
                      <Address address={item.to} ensProvider={mainnetProvider} fontSize={16} />
                      {item.data.slice(0, 15)}...
                    </List.Item>
                  );
                }}
              />
            </div>
          </div>
        </Route>
      </Switch>

      <ThemeSwitch />

      {/* 🗺 Extra UI like gas price, eth price, faucet, and support: */}
      <div style={{ position: "fixed", textAlign: "left", left: 0, bottom: 20, padding: 10 }}>
        <Row align="middle" gutter={[4, 4]}>
          <Col span={8}>
            <Ramp price={price} address={address} networks={NETWORKS} />
          </Col>

          <Col span={8} style={{ textAlign: "center", opacity: 0.8 }}>
            <GasGauge gasPrice={gasPrice} />
          </Col>
          <Col span={8} style={{ textAlign: "center", opacity: 1 }}>
            <Button
              onClick={() => {
                window.open("https://t.me/joinchat/KByvmRe5wkR-8F_zz6AjpA");
              }}
              size="large"
              shape="round"
            >
              <span style={{ marginRight: 8 }} role="img" aria-label="support">
                💬
              </span>
              Support
            </Button>
          </Col>
        </Row>

        <Row align="middle" gutter={[4, 4]}>
          <Col span={24}>
            {
              /*  if the local provider has a signer, let's show the faucet:  */
              faucetAvailable ? (
                <Faucet localProvider={localProvider} price={price} ensProvider={mainnetProvider} />
              ) : (
                ""
              )
            }
          </Col>
        </Row>
      </div>
    </div>
  );
}

export default App;
