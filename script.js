document.addEventListener('DOMContentLoaded', () => {
    const boardElement = document.getElementById('board');
    const cells = document.querySelectorAll('.cell');
    const statusMessage = document.getElementById('status-message');
    const resetButton = document.getElementById('reset-btn');
    const connectButton = document.getElementById('connect-wallet-btn');
    const winStreakCountElement = document.getElementById('win-streak-count');

    const PLAYER_X = 'X';
    const PLAYER_O = 'O'; // AI
    let currentPlayer = PLAYER_X;
    let boardState = Array(9).fill(null);
    let gameActive = false;
    let consecutiveWins = 0;
    let walletProvider = null;
    let signer = null;
    let userAddress = null;

    const winningCombinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6]  // Diagonals
    ];

    // --- Wallet Connection --- 
    async function connectWallet() {
        if (typeof window.ethereum !== 'undefined') {
            try {
                statusMessage.textContent = "Connecting...";
                // Request account access
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                walletProvider = new ethers.providers.Web3Provider(window.ethereum);
                signer = walletProvider.getSigner();
                userAddress = await signer.getAddress();

                // --- Status Network Testnet Configuration ---
                const statusTestnetChainId = '0x6300b5ea'; // 1660990954 in hex (Corrected based on prior user info)
                const statusTestnetRpcUrl = 'https://public.sepolia.rpc.status.network';
                const statusTestnetChainName = 'Status Network Testnet';
                const statusTestnetSymbol = 'ETH'; // Using ETH as symbol as per details
                const statusTestnetExplorerUrl = 'https://sepoliascan.status.network';

                try {
                   // Check current chain ID
                   const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });

                   if (currentChainId !== statusTestnetChainId) {
                       statusMessage.textContent = "Requesting network switch...";
                       try {
                           // Try switching to the chain
                           await window.ethereum.request({
                               method: 'wallet_switchEthereumChain',
                               params: [{ chainId: statusTestnetChainId }],
                           });
                           // Wait a tiny bit for MetaMask to potentially update internally after switch
                           await new Promise(resolve => setTimeout(resolve, 500)); 

                       } catch (switchError) {
                           // Error code 4902 indicates the chain has not been added to MetaMask.
                           if (switchError.code === 4902) {
                               statusMessage.textContent = "Requesting to add network...";
                               try {
                                   // Try adding the chain
                                   await window.ethereum.request({
                                       method: 'wallet_addEthereumChain',
                                       params: [{
                                            chainId: statusTestnetChainId,
                                            chainName: statusTestnetChainName,
                                            rpcUrls: [statusTestnetRpcUrl],
                                            nativeCurrency: {
                                                name: statusTestnetSymbol, // Using symbol as name for simplicity here
                                                symbol: statusTestnetSymbol,
                                                decimals: 18
                                            },
                                            blockExplorerUrls: [statusTestnetExplorerUrl]
                                        }],
                                   });
                                    // Wait a tiny bit for MetaMask to potentially update internally after add
                                    await new Promise(resolve => setTimeout(resolve, 500)); 
                               } catch (addError) {
                                   console.error("Failed to add Status Network Testnet:", addError);
                                   statusMessage.textContent = "Failed to add Status Network. Please add it manually.";
                                    // Clear wallet state if network setup failed
                                   walletProvider = null;
                                   signer = null;
                                   userAddress = null;
                                   return;
                               }
                           } else {
                            console.error("Failed to switch to Status Network Testnet:", switchError);
                            statusMessage.textContent = "Failed to switch network. Please switch manually.";
                             // Clear wallet state if network setup failed
                            walletProvider = null;
                            signer = null;
                            userAddress = null;
                            return;
                           }
                       }
                       
                       // IMPORTANT: Re-initialize provider and signer AFTER switch/add attempt
                       // to ensure ethers.js uses the correct network context.
                       statusMessage.textContent = "Re-initializing connection...";
                       walletProvider = new ethers.providers.Web3Provider(window.ethereum);
                       signer = walletProvider.getSigner();
                       userAddress = await signer.getAddress(); // Re-fetch address in case it changed?

                       // Re-verify the chain ID AFTER re-initializing
                       const finalChainId = await window.ethereum.request({ method: 'eth_chainId' });
                       if (finalChainId !== statusTestnetChainId) {
                           console.error(`Failed to switch. Expected ${statusTestnetChainId}, but got ${finalChainId}`);
                           statusMessage.textContent = `Network mismatch. Please manually switch to ${statusTestnetChainName} in MetaMask and refresh.`;
                           // Clear wallet state as we are on the wrong network
                           walletProvider = null;
                           signer = null;
                           userAddress = null;
                           return;
                       }
                   }
                   // --- End Status Network Configuration ---

                   // If we reach here, we are connected to the right account and network
                   statusMessage.textContent = `Connected: ${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)} on ${statusTestnetChainName}. Your turn (X)!`;
                   connectButton.style.display = 'none';
                   resetButton.style.display = 'inline-block';
                   startGame();
                } catch (networkError) {
                    console.error("Network check/switch failed:", networkError);
                    statusMessage.textContent = "Could not configure network. Please check MetaMask.";
                    // Clear wallet state if network setup failed
                    walletProvider = null;
                    signer = null;
                    userAddress = null;
                }

            } catch (error) {
                console.error("Wallet connection failed:", error);
                // Check if user rejected the connection request
                if (error.code === 4001) { // EIP-1193 user rejection error
                    statusMessage.textContent = "Wallet connection rejected. Please connect to play.";
                } else {
                    statusMessage.textContent = "Connection failed. Please try again.";
                }
                // Clear wallet state
                walletProvider = null;
                signer = null;
                userAddress = null;
            } 
        } else {
            statusMessage.textContent = "MetaMask not detected. Please install MetaMask.";
            alert("Please install MetaMask to use this dApp!");
        }
    }

    // --- Game Logic --- 
    function startGame() {
        boardState.fill(null);
        cells.forEach(cell => {
            cell.textContent = '';
            cell.classList.remove(PLAYER_X, PLAYER_O, 'winning-cell');
        });
        currentPlayer = PLAYER_X;
        gameActive = true;
        resetButton.style.display = 'inline-block';
        if (userAddress) {
             statusMessage.textContent = `Connected: ${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)}. Your turn (X)!`;
        } else {
             statusMessage.textContent = "Connect wallet to start."; // Should not happen if game starts after connect
        }
    }

    function handleCellClick(event) {
        if (!gameActive || !signer) return; // Only play if game is active and wallet connected

        const clickedCell = event.target;
        const cellIndex = parseInt(clickedCell.dataset.index);

        if (boardState[cellIndex] !== null || currentPlayer !== PLAYER_X) {
            return; // Cell already taken or not player's turn
        }

        makeMove(cellIndex, PLAYER_X);

        if (checkWin(PLAYER_X)) {
            endGame(false, PLAYER_X);
        } else if (boardState.every(cell => cell !== null)) {
            endGame(true); // Draw
        } else {
            currentPlayer = PLAYER_O;
            statusMessage.textContent = "AI is thinking...";
            // AI makes its move after a short delay
            setTimeout(aiMove, 500);
        }
    }

    function makeMove(index, player) {
        if (boardState[index] === null && gameActive) {
            boardState[index] = player;
            cells[index].textContent = player;
            cells[index].classList.add(player.toLowerCase());
            return true;
        }
        return false;
    }

    function checkWin(player) {
        return winningCombinations.some(combination => {
            return combination.every(index => boardState[index] === player);
        });
    }

    function highlightWinningCells(player) {
        winningCombinations.forEach(combination => {
            if (combination.every(index => boardState[index] === player)) {
                combination.forEach(index => {
                    cells[index].classList.add('winning-cell');
                });
            }
        });
    }

    function endGame(isDraw, winner = null) {
        gameActive = false;
        resetButton.style.display = 'inline-block';

        if (isDraw) {
            statusMessage.textContent = "It's a Draw!";
            consecutiveWins = 0; // Reset streak on draw
        } else if (winner) {
            statusMessage.textContent = `${winner} Wins!`;
            highlightWinningCells(winner);
            if (winner === PLAYER_X) {
                consecutiveWins++;
                handleWinTransaction(); // Sign tx on win
                if (consecutiveWins >= 3) {
                    handleNFTReward(); // Mint NFT on 3 wins
                    consecutiveWins = 0; // Reset after reward
                }
            } else { // AI Wins
                consecutiveWins = 0; // Reset streak if AI wins
            }
        }
        winStreakCountElement.textContent = consecutiveWins;
    }

    function aiMove() {
        if (!gameActive || currentPlayer !== PLAYER_O) return;

        let move = -1;

        // 1. Check if AI can win
        for (let i = 0; i < boardState.length; i++) {
            if (boardState[i] === null) {
                boardState[i] = PLAYER_O; // Try the move
                if (checkWin(PLAYER_O)) {
                    move = i;
                    boardState[i] = null; // Undo the move
                    break;
                }
                boardState[i] = null; // Undo the move
            }
        }

        // 2. Check if Player X can win, and block
        if (move === -1) {
            for (let i = 0; i < boardState.length; i++) {
                if (boardState[i] === null) {
                    boardState[i] = PLAYER_X; // Try the move for player
                    if (checkWin(PLAYER_X)) {
                        move = i; // Block this spot
                        boardState[i] = null; // Undo the move
                        break;
                    }
                    boardState[i] = null; // Undo the move
                }
            }
        }

        // 3. Pick a random available spot
        if (move === -1) {
            const availableSpots = [];
            for (let i = 0; i < boardState.length; i++) {
                if (boardState[i] === null) {
                    availableSpots.push(i);
                }
            }
            if (availableSpots.length > 0) {
                const randomIndex = Math.floor(Math.random() * availableSpots.length);
                move = availableSpots[randomIndex];
            }
        }

        // Make the determined move
        if (move !== -1) {
            makeMove(move, PLAYER_O);
        } else {
            // Should not happen if draw is checked correctly, but as a fallback:
            console.error("AI couldn't find a move?");
            return; 
        }

        // Check game status after AI move
        if (checkWin(PLAYER_O)) {
            endGame(false, PLAYER_O);
        } else if (boardState.every(cell => cell !== null)) {
            endGame(true); // Draw
        } else {
            currentPlayer = PLAYER_X;
            statusMessage.textContent = "Your turn (X)!";
        }
    }

    // --- Blockchain Interaction Placeholders --- 
    async function handleWinTransaction() {
        if (!signer || !userAddress) return;
        statusMessage.textContent = "You won! Preparing transaction...";
        console.log("Player X won! Initiating transaction signing...");

        // Prepare message
        const winMessage = `Player ${userAddress} won this TicTacToe round on Status Network!`;
        let messageHex = "0x"; // Default empty data
        try {
             messageHex = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(winMessage));
        } catch (e) {
            console.error("Failed to encode win message:", e);
            // Proceed without message data if encoding fails
        }

        try {
            const tx = await signer.sendTransaction({
                to: userAddress, 
                value: ethers.utils.parseEther("0"),
                data: messageHex // Add the encoded message here
            });
            statusMessage.textContent = "Win Tx initiated! Waiting for confirmation..."; // Shortened message
            console.log("Transaction sent:", tx.hash);
            await tx.wait(); // Wait for the transaction to be mined
            console.log("Transaction confirmed:", tx.hash);
            statusMessage.textContent = `Win Tx confirmed: ${tx.hash.substring(0,10)}...`;
            // Keep game ended message briefly before resetting prompt
            setTimeout(() => {
                 // Only update if game hasn't restarted
                 if (!gameActive && statusMessage.textContent.startsWith('Win Tx confirmed')) {
                    statusMessage.textContent = `Player X Wins! Play again?`;
                 }
            }, 3000);
        } catch (error) {
            console.error("Transaction failed:", error);
             let errorMsg = "Win Tx failed. See console."; // Default
             if (error.code === 'ACTION_REJECTED') {
                 errorMsg = "Win Tx rejected.";
             }
            statusMessage.textContent = errorMsg;
             // Keep game ended message briefly before resetting prompt
            setTimeout(() => {
                 if (!gameActive && statusMessage.textContent === errorMsg) {
                    statusMessage.textContent = `Player X Wins! Tx failed. Play again?`;
                 }
            }, 3000);
        }
    }

    async function handleNFTReward() {
        if (!signer) return;

        // Ensure we are still on the correct network before minting
        try {
             const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
             // Use the constant defined at the top for consistency
             if (currentChainId !== '0x6300005A') { 
                 statusMessage.textContent = "Incorrect network. Please switch to Status Network Testnet.";
                 alert(`Please switch your wallet to the Status Network Testnet (Chain ID ${'0x6300005A'}) to mint the NFT.`);
                 return;
             }
        } catch (e) {
             console.error("Could not verify network:", e);
             statusMessage.textContent = "Could not verify network. Cannot mint NFT.";
             return;
        }

        statusMessage.textContent = "3 Wins! Minting NFT reward...";
        console.log("Minting NFT for 3 consecutive wins...");

        // TODO: Implement NFT Minting
        // 1. Define the NFT Contract ABI - DONE
        // 2. Get the deployed NFT Contract address on Status Network - DONE
        // 3. Create a contract instance with ethers.js - DONE
        // 4. Call the mint function (or safeMint) on the contract - DONE

        const nftContractAddress = "0xD02D9a513970F965AbCC683485c206a3F346d0CB"; 
        const nftContractABI = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			}
		],
		"name": "approve",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "initialOwner",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "sender",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			}
		],
		"name": "ERC721IncorrectOwner",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "operator",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			}
		],
		"name": "ERC721InsufficientApproval",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "approver",
				"type": "address"
			}
		],
		"name": "ERC721InvalidApprover",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "operator",
				"type": "address"
			}
		],
		"name": "ERC721InvalidOperator",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			}
		],
		"name": "ERC721InvalidOwner",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "receiver",
				"type": "address"
			}
		],
		"name": "ERC721InvalidReceiver",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "sender",
				"type": "address"
			}
		],
		"name": "ERC721InvalidSender",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			}
		],
		"name": "ERC721NonexistentToken",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			}
		],
		"name": "OwnableInvalidOwner",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "account",
				"type": "address"
			}
		],
		"name": "OwnableUnauthorizedAccount",
		"type": "error"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "approved",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			}
		],
		"name": "Approval",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "operator",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "bool",
				"name": "approved",
				"type": "bool"
			}
		],
		"name": "ApprovalForAll",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "_fromTokenId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "_toTokenId",
				"type": "uint256"
			}
		],
		"name": "BatchMetadataUpdate",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "_tokenId",
				"type": "uint256"
			}
		],
		"name": "MetadataUpdate",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "previousOwner",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "newOwner",
				"type": "address"
			}
		],
		"name": "OwnershipTransferred",
		"type": "event"
	},
	{
		"inputs": [],
		"name": "renounceOwnership",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "string",
				"name": "uri",
				"type": "string"
			}
		],
		"name": "safeMint",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			}
		],
		"name": "safeTransferFrom",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			},
			{
				"internalType": "bytes",
				"name": "data",
				"type": "bytes"
			}
		],
		"name": "safeTransferFrom",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "operator",
				"type": "address"
			},
			{
				"internalType": "bool",
				"name": "approved",
				"type": "bool"
			}
		],
		"name": "setApprovalForAll",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			}
		],
		"name": "Transfer",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			}
		],
		"name": "transferFrom",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "newOwner",
				"type": "address"
			}
		],
		"name": "transferOwnership",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			}
		],
		"name": "balanceOf",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			}
		],
		"name": "getApproved",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "operator",
				"type": "address"
			}
		],
		"name": "isApprovedForAll",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "name",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			}
		],
		"name": "ownerOf",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes4",
				"name": "interfaceId",
				"type": "bytes4"
			}
		],
		"name": "supportsInterface",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "symbol",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "tokenId",
				"type": "uint256"
			}
		],
		"name": "tokenURI",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]; 
        const metadataUri = "ipfs://bafkreiekzaqbqlay3fvxk6tftzx55puilo6r5afe3dppkwdunowozd3ro4"; 

        // Simplified check now that ABI/Address/URI are hardcoded
        if (!nftContractAddress || nftContractABI.length === 0 || !metadataUri) {
            console.error("NFT Contract Address/ABI/Metadata URI not set correctly in script.js");
            statusMessage.textContent = "NFT Minting configuration error. Check console.";
            return;
        }

        try {
            const nftContract = new ethers.Contract(nftContractAddress, nftContractABI, signer);
            // Assume your NFT contract has a mint function like: `safeMint(address to, string memory uri)`
            // Pass the specific metadata URI for this token
            const mintTx = await nftContract.safeMint(userAddress, metadataUri);
            statusMessage.textContent = "NFT Mint transaction sent! Waiting for confirmation...";
            console.log("NFT Mint Transaction sent:", mintTx.hash);
            await mintTx.wait();
            console.log("NFT Mint Transaction confirmed:", mintTx.hash);
            statusMessage.textContent = `Congrats! NFT Minted: ${mintTx.hash.substring(0,10)}...`;
             // Keep game ended message briefly before resetting prompt
            setTimeout(() => {
                 if (!gameActive) statusMessage.textContent = `Player X Wins! NFT awarded! Play again?`;
            }, 3000);

        } catch (error) {
            console.error("NFT Minting failed:", error);
            // Provide more specific feedback if possible (e.g., check console)
            if (error.code === 'ACTION_REJECTED') {
                 statusMessage.textContent = "NFT Mint transaction rejected.";
            } else if (error.data?.message) { // Check for revert reason
                 statusMessage.textContent = `NFT Minting failed: ${error.data.message}`;
            } else {
                 statusMessage.textContent = "NFT Minting failed. See console for details.";
            }
             // Keep game ended message briefly before resetting prompt
            setTimeout(() => {
                 if (!gameActive) statusMessage.textContent = `Player X Wins! NFT mint failed. Play again?`;
            }, 3000);
        }
    }

    // --- Event Listeners --- 
    cells.forEach(cell => cell.addEventListener('click', handleCellClick));
    resetButton.addEventListener('click', startGame);
    connectButton.addEventListener('click', connectWallet);

}); 