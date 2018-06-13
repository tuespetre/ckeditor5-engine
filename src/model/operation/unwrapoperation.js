/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/**
 * @module engine/model/operation/unwrapoperation
 */

import Operation from './operation';
import WrapOperation from './wrapoperation';
import Position from '../position';
import Range from '../range';
import Element from '../element';
import CKEditorError from '@ckeditor/ckeditor5-utils/src/ckeditorerror';
import { _remove, _move } from './utils';

/**
 * Operation to unwrap a {@link module:engine/model/element~Element model element}. In the result, the unwrapped element
 * is removed and its children are moved in its place.
 *
 * @extends module:engine/model/operation/operation~Operation
 */
export default class UnwrapOperation extends Operation {
	/**
	 * Creates an unwrap operation.
	 *
	 * @param {module:engine/model/position~Position} position Position inside the element to unwrap.
	 * @param {Number} howMany How many nodes are inside unwrapped element.
	 * @param {Number|null} baseVersion Document {@link module:engine/model/document~Document#version} on which operation
	 * can be applied or `null` if the operation operates on detached (non-document) tree.
	 */
	constructor( position, howMany, baseVersion ) {
		super( baseVersion );

		/**
		 * Position inside the element to unwrap.
		 *
		 * @member {module:engine/model/position~Position} module:engine/model/operation/unwrapoperation~UnwrapOperation#position
		 */
		this.position = Position.createFromPosition( position );
		this.position.stickiness = 'toPrevious'; // Keep the position always at the beginning of the element.

		/**
		 * How many nodes are inside unwrapped element.
		 *
		 * This information is needed to properly reverse `UnwrapOperation` and to properly transform by `UnwrapOperation`.
		 *
		 * @member {Number} module:engine/model/operation/unwrapoperation~UnwrapOperation#_howMany
		 */
		this.howMany = howMany;

		/**
		 * A clone of the unwrapped element (without children).
		 *
		 * This information is needed to properly reverse `UnwrapOperation`.
		 *
		 * @protected
		 * @member {module:engine/model/element~Element} module:engine/model/operation/unwrapoperation~UnwrapOperation#_element
		 */
		this._element = null;
	}

	/**
	 * @inheritDoc
	 */
	get type() {
		return 'unwrap';
	}

	/**
	 * A range containing all nodes that will be unwrapped.
	 *
	 * @readonly
	 * @type {module:engine/model/range~Range}
	 */
	get unwrappedRange() {
		return Range.createFromPositionAndShift( this.position, this.howMany );
	}

	get targetPosition() {
		const path = this.position.path.slice( 0, -1 );

		return new Position( this.position.root, path );
	}

	/**
	 * Creates and returns an operation that has the same parameters as this operation.
	 *
	 * @returns {module:engine/model/operation/unwrapoperation~UnwrapOperation} Clone of this operation.
	 */
	clone() {
		const op = new this.constructor( this.position, this.howMany, this.baseVersion );

		op._element = this._element;

		return op;
	}

	/**
	 * See {@link module:engine/model/operation/operation~Operation#getReversed `Operation#getReversed()`}.
	 *
	 * @returns {module:engine/model/operation/wrapoperation~WrapOperation}
	 */
	getReversed() {
		return new WrapOperation( this.position, this.howMany, this._element, this.baseVersion + 1 );
	}

	/**
	 * @inheritDoc
	 */
	_validate() {
		const element = this.position.parent;

		// Validate whether unwrap operation has correct parameters.
		if ( !element || !element.is( 'element' ) ) {
			/**
			 * Unwrap position is invalid.
			 *
			 * @error unwrap-operation-position-invalid
			 */
			throw new CKEditorError( 'unwrap-operation-position-invalid: Unwrap position is invalid.' );
		} else if ( element.maxOffset !== this.howMany ) {
			/**
			 * Operation specifies incorrect number of nodes to unwrap.
			 *
			 * @error unwrap-operation-incorrect-how-many
			 */
			throw new CKEditorError( 'unwrap-operation-incorrect-how-many: Operation specifies incorrect number of nodes to unwrap.' );
		}
	}

	/**
	 * @inheritDoc
	 */
	_execute() {
		const elementToUnwrap = this.position.parent;
		const targetPosition = Position.createAfter( elementToUnwrap );

		this._element = elementToUnwrap._clone();

		_move( this.unwrappedRange, targetPosition );
		_remove( Range.createOn( elementToUnwrap ) );
	}

	/**
	 * @inheritDoc
	 */
	static get className() {
		return 'engine.model.operation.UnwrapOperation';
	}

	/**
	 * Creates `UnwrapOperation` object from deserilized object, i.e. from parsed JSON string.
	 *
	 * @param {Object} json Deserialized JSON object.
	 * @param {module:engine/model/document~Document} document Document on which this operation will be applied.
	 * @returns {module:engine/model/operation/unwrapoperation~UnwrapOperation}
	 */
	static fromJSON( json, document ) {
		const position = Position.fromJSON( json.position, document );
		const element = Element.fromJSON( json._element );

		const op = new this( position, json.howMany, json.baseVersion );
		op._element = element;

		return op;
	}
}
