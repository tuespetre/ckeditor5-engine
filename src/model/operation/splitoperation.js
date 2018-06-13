/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/**
 * @module engine/model/operation/splitoperation
 */

import Operation from './operation';
import MergeOperation from './mergeoperation';
import Position from '../position';
import Range from '../range';
import { _insert, _move } from './utils';

/**
 * Operation to split {@link module:engine/model/element~Element an element} at
 * given {@link module:engine/model/position~Position position} into two elements, both containing a part of the element's content.
 *
 * @extends module:engine/model/operation/operation~Operation
 */
export default class SplitOperation extends Operation {
	/**
	 * Creates a split operation.
	 *
	 * @param {module:engine/model/position~Position} position Position at which an element should be split.
	 * @param {Number|null} baseVersion Document {@link module:engine/model/document~Document#version} on which operation
	 * can be applied or `null` if the operation operates on detached (non-document) tree.
	 */
	constructor( position, baseVersion ) {
		super( baseVersion );

		/**
		 * Position at which an element should be split.
		 *
		 * @member {module:engine/model/position~Position} module:engine/model/operation/splitoperation~SplitOperation#position
		 */
		this.position = Position.createFromPosition( position );
	}

	/**
	 * @inheritDoc
	 */
	get type() {
		return 'split';
	}

	/**
	 * Position after the split element. This is a position at which the clone of split element will be inserted.
	 * Calculated based on the split position.
	 *
	 * @readonly
	 * @type {module:engine/model/position~Position}
	 */
	get insertionPosition() {
		const path = this.position.path.slice( -1 );
		path[ path.length - 1 ]++;

		return new Position( this.position.root, path );
	}

	/**
	 * Position inside the new clone of a split element. This is a position where nodes from after the split position will
	 * be moved to. Calculated based on the split position.
	 *
	 * @readonly
	 * @type {module:engine/model/position~Position}
	 */
	get moveTargetPosition() {
		const path = this.position.path.slice( -1 );
		path[ path.length - 1 ]++;
		path.push( 0 );

		return new Position( this.position.root, path );
	}

	/**
	 * Artificial range that contains all the nodes from the split element that will be moved to the new element.
	 * The range starts at {@link ~#position} and ends in the same parent, at `POSITIVE_INFINITY` offset.
	 *
	 * @readonly
	 * @type {module:engine/model/range~Range}
	 */
	get movedRange() {
		const end = this.position.getShiftedBy( Number.POSITIVE_INFINITY );

		return new Range( this.position, end );
	}

	/**
	 * Creates and returns an operation that has the same parameters as this operation.
	 *
	 * @returns {module:engine/model/operation/splitoperation~SplitOperation} Clone of this operation.
	 */
	clone() {
		return new this.constructor( this.position, this.baseVersion );
	}

	/**
	 * See {@link module:engine/model/operation/operation~Operation#getReversed `Operation#getReversed()`}.
	 *
	 * @returns {module:engine/model/operation/mergeoperation~MergeOperation}
	 */
	getReversed() {
		return new MergeOperation( this.moveTargetPosition, this.position, this.baseVersion + 1 );
	}

	/**
	 * @inheritDoc
	 */
	_validate() {
		const element = this.position.parent;
		const offset = this.position.offset;

		// Validate whether split operation has correct parameters.
		if ( !element || element.maxOffset < offset ) {
			/**
			 * Split position is invalid.
			 *
			 * @error split-operation-position-invalid
			 */
			throw new CKEditorError( 'split-operation-position-invalid: Split position is invalid.' );
		}
	}

	/**
	 * @inheritDoc
	 */
	_execute() {
		const splitElement = this.position.parent;
		const newElement = splitElement._clone();

		_insert( this.insertionPosition, newElement );

		const sourceRange = Range.createFromParentsAndOffsets( splitElement, this.position.offset, splitElement, splitElement.maxOffset );

		_move( sourceRange, this.moveTargetPosition );
	}

	/**
	 * @inheritDoc
	 */
	static get className() {
		return 'engine.model.operation.SplitOperation';
	}

	/**
	 * Creates `SplitOperation` object from deserilized object, i.e. from parsed JSON string.
	 *
	 * @param {Object} json Deserialized JSON object.
	 * @param {module:engine/model/document~Document} document Document on which this operation will be applied.
	 * @returns {module:engine/model/operation/splitoperation~SplitOperation}
	 */
	static fromJSON( json, document ) {
		const position = Position.fromJSON( json.position, document );

		return new this( position, json.baseVersion );
	}
}
