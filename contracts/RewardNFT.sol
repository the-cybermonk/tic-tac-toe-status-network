// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title TicTacToeWinner
 * @dev A simple ERC721 NFT contract to reward Tic Tac Toe winners.
 * Only the owner (deployer or the game server/contract) can mint new tokens.
 */
contract TicTacToeWinner is ERC721, Ownable, ERC721URIStorage {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdCounter;

    // Base URI for token metadata (can be updated by the owner)
    string private _baseTokenURI;

    /**
     * @dev Sets the initial owner, token name, and symbol.
     */
    constructor(address initialOwner) 
        ERC721("TicTacToeWinner", "TTTW")
        Ownable(initialOwner) {}

    /**
     * @dev Mints a new NFT to the specified address.
     * Can only be called by the owner.
     * Associates the token ID with a specific URI.
     * @param to The address to mint the NFT to.
     * @param uri The metadata URI for this specific token.
     */
    function safeMint(address to, string memory uri) public onlyOwner {
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    /**
     * @dev Sets the base URI for retrieving token metadata. 
     * Can only be called by the owner.
     * Example: "ipfs://YourMetadataFolderCID/"
     */
    function _setBaseURI(string memory baseURI) internal onlyOwner {
        _baseTokenURI = baseURI;
    }

    /**
     * @dev Base URI for computing tokenURI. If set, the resulting URI for each 
     * token will be the concatenation of the `baseURI` and the `tokenId`.
     * If not set, the URI mechanism from ERC721URIStorage is used.
     */
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // The following functions are overrides required by Solidity.
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
         // If baseURI is set, concatenate, otherwise use the stored URI per token
        string memory base = _baseURI();
        if (bytes(base).length > 0) {
             // Efficiently concatenate base URI and token ID (converted to string)
            // Note: On-chain string conversion for uint256 can be gas-intensive.
            // Consider doing this off-chain and using setTokenURI if gas is a concern.
            return string(abi.encodePacked(base, Strings.toString(tokenId)));
        }
        // Fallback to URI set during minting if no base URI is set
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
} 