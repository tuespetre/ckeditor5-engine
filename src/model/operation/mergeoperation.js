/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/**
 * @module engine/model/operation/mergeoperation
 */

import Operation from './operation';
import SplitOperation from './splitoperation';
import Position from '../position';
import Range from '../range';
import { _remove, _move } from './utils';

/**
 * Operation to merge two {@link module:engine/model/element~Element elements}. The merged elements are a parent of given
 * {@link module:engine/model/position~Position position} and the next element.
 *
 * Technically, the content of the next element is moved at given {@link module:engine/model/position~Position position}
 * and the element is removed.
 *
 * @extends module:engine/model/operation/operation~Operation
 */
export default class MergeOperation extends Operation {
	/**
	 * Creates a merge operation.
	 *
	 * @param {module:engine/model/position~Position} sourcePosition Position inside the merged element. All nodes from that
	 * element after that position will be moved to {@link ~#targetPosition}.
	 * @param {module:engine/model/position~Position} targetPosition Position which the nodes from the merged elements
	 * will be moved to.
	 * @param {Number|null} baseVersion Document {@link module:engine/model/document~Document#version} on which operation
	 * can be applied or `null` if the operation operates on detached (non-document) tree.
	 */
	constructor( sourcePosition, targetPosition, baseVersion ) {
		super( baseVersion );

		/**
		 * Position inside the merged element. All nodes from that element after that position will be moved to {@link ~#targetPosition}.
		 *
		 * @member {module:engine/model/position~Position} module:engine/model/operation/mergeoperation~MergeOperation#sourcePosition
		 */
		this.sourcePosition = Position.createFromPosition( sourcePosition );

		/**
		 * Position which the nodes from the merged elements will be moved to.
		 *
		 * @member {module:engine/model/position~Position} module:engine/model/operation/mergeoperation~MergeOperation#targetPosition
		 */
		this.targetPosition = Position.createFromPosition( targetPosition );
	}

	/**
	 * @inheritDoc
	 */
	get type() {
		return 'merge';
	}

	/**
	 * Position before the merged element (which will be removed). Calculated based on the split position.
	 *
	 * @readonly
	 * @type {module:engine/model/position~Position}
	 */
	get deletionPosition() {
		return new Position( this.sourcePosition.root, this.sourcePosition.path.slice( -1 ) );
	}

	/**
	 * Artificial range that contains all the nodes from the merged element that will be moved to {@link ~#sourcePosition}.
	 * The range starts at {@link ~#sourcePosition} and ends in the same parent, at `POSITIVE_INFINITY` offset.
	 *
	 * @readonly
	 * @type {module:engine/model/range~Range}
	 */
	get movedRange() {
		const end = this.sourcePosition.getShiftedBy( Number.POSITIVE_INFINITY );

		return new Range( this.sourcePosition, end );
	}

	/**
	 * Creates and returns an operation that has the same parameters as this operation.
	 *
	 * @returns {module:engine/model/operation/mergeoperation~MergeOperation} Clone of this operation.
	 */
	clone() {
		return new this.constructor( this.sourcePosition, this.targetPosition, this.baseVersion );
	}

	/**
	 * See {@link module:engine/model/operation/operation~Operation#getReversed `Operation#getReversed()`}.
	 *
	 * @returns {module:engine/model/operation/splitoperation~SplitOperation}
	 */
	getReversed() {
		return new SplitOperation( this.sourcePosition, this.baseVersion + 1 );
	}

	/**
	 * @inheritDoc
	 */
	_validate() {
		const sourceElement = this.sourcePosition.parent;
		const targetElement = this.targetPosition.parent;

		// Validate whether merge operation has correct parameters.
		if ( !sourceElement || !sourceElement.is( 'element' ) ) {
			/**
			 * Merge source position is invalid.
			 *
			 * @error merge-operation-source-position-invalid
			 */
			throw new CKEditorError( 'merge-operation-source-position-invalid: Merge source position is invalid.' );
		} else if ( !targetElement || !targetElement.is( 'element' ) ) {
			/**
			 * Merge target position is invalid.
			 *
			 * @error merge-operation-target-position-invalid
			 */
			throw new CKEditorError( 'merge-operation-target-position-invalid: Merge target position is invalid.' );
		}
	}

	/**
	 * @inheritDoc
	 */
	_execute() {
		const mergedElement = this.sourcePosition.parent;
		const sourceRange = Range.createIn( mergedElement );

		_move( sourceRange, this.targetPosition );
		_remove( Range.createOn( mergedElement ) );
	}

	/**
	 * @inheritDoc
	 */
	static get className() {
		return 'engine.model.operation.MergeOperation';
	}

	/**
	 * Creates `MergeOperation` object from deserilized object, i.e. from parsed JSON string.
	 *
	 * @param {Object} json Deserialized JSON object.
	 * @param {module:engine/model/document~Document} document Document on which this operation will be applied.
	 * @returns {module:engine/model/operation/mergeoperation~MergeOperation}
	 */
	static fromJSON( json, document ) {
		const sourcePosition = Position.fromJSON( json.sourcePosition, document );
		const targetPosition = Position.fromJSON( json.targetPosition, document );

		return new this( sourcePosition, targetPosition, json.baseVersion );
	}
}
