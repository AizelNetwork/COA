// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CoaInference is Ownable {
    uint256 private _requestCounter;
    address private _inferenceNode;

    struct Call {
        address caller;
        string model;
        bytes32 promptHash;
        bytes32 resultHash;
        bytes32 reportHash;
    }

    mapping(uint256 => Call) public calls;
    mapping(string => bool) public models;
    string[] public modelList; // Array to track all models

    event CallRequested(
        uint256 indexed requestId,
        address indexed caller,
        string model,
        bytes32 promptHash
    );

    event CallFinished(
        uint256 indexed requestId,
        bytes32 resultHash,
        bytes32 reportHash
    );

    event ModelAdded(string model);
    event ModelDeled(string model);

    modifier onlyInferenceNode() {
        require(msg.sender == _inferenceNode, "Inference: not inference node");
        _;
    }

    constructor(
        address inferenceNode_,
        string[] memory initialModels
    ) Ownable(msg.sender) {
        require(
            inferenceNode_ != address(0),
            "Inference: inference node can't be empty"
        );
        _inferenceNode = inferenceNode_;
        addModels(initialModels);
    }

    receive() external payable {}

    function inferenceNode() public view returns (address) {
        return _inferenceNode;
    }

    function setInferenceNode(address inferenceNode_) public onlyOwner {
        require(
            inferenceNode_ != address(0),
            "Inference: inference node can't be empty"
        );
        _inferenceNode = inferenceNode_;
    }

    function addModel(string calldata model) public onlyOwner {
        require(!models[model], "Inference: model already exists");
        models[model] = true;
        modelList.push(model);
        emit ModelAdded(model);
    }

    function addModels(string[] memory models_) public onlyOwner {
        for (uint256 i = 0; i < models_.length; i++) {
            if (!models[models_[i]]) {
                models[models_[i]] = true;
                modelList.push(models_[i]);
                emit ModelAdded(models_[i]);
            }
        }
    }

    function delModel(string calldata model) public onlyOwner {
        require(models[model], "Inference: model no exists");
        models[model] = false;

        // Remove from modelList
        for (uint256 i = 0; i < modelList.length; i++) {
            if (keccak256(bytes(modelList[i])) == keccak256(bytes(model))) {
                // Replace with the last element and pop
                modelList[i] = modelList[modelList.length - 1];
                modelList.pop();
                break;
            }
        }

        emit ModelDeled(model);
    }

    function delModels(string[] memory models_) public onlyOwner {
        for (uint256 i = 0; i < models_.length; i++) {
            if (models[models_[i]]) {
                models[models_[i]] = false;

                // Remove from modelList
                for (uint256 j = 0; j < modelList.length; j++) {
                    if (
                        keccak256(bytes(modelList[j])) ==
                        keccak256(bytes(models_[i]))
                    ) {
                        // Replace with the last element and pop
                        modelList[j] = modelList[modelList.length - 1];
                        modelList.pop();
                        break;
                    }
                }

                emit ModelDeled(models_[i]);
            }
        }
    }

    function getCaller(uint256 requestId) public view returns (address) {
        return calls[requestId].caller;
    }

    function requestCall(string calldata model, bytes32 promptHash) external {
        require(models[model], "Inference: model unsupported");
        require(promptHash != bytes32(0), "Inference: prompt hash is empty");

        uint256 requestId = ++_requestCounter;
        calls[requestId] = Call({
            caller: msg.sender,
            model: model,
            promptHash: promptHash,
            resultHash: bytes32(0),
            reportHash: bytes32(0)
        });

        emit CallRequested(requestId, msg.sender, model, promptHash);
    }

    function submitResult(
        uint256 requestId,
        bytes32 resultHash,
        bytes32 reportHash
    ) external onlyInferenceNode {
        require(
            requestId > 0 && requestId <= _requestCounter,
            "Inference: invalid requestId"
        );
        Call storage call = calls[requestId];
        require(call.resultHash == bytes32(0), "Inference: already fulfilled");

        call.resultHash = resultHash;
        call.reportHash = reportHash;

        emit CallFinished(requestId, resultHash, reportHash);
    }

    /**
     * Get all available models
     * @return string[] Array of all available model names
     */
    function getAllModels() external view returns (string[] memory) {
        return modelList;
    }
}
