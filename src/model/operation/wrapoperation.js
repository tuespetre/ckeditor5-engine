/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/**
 * @module engine/model/operation/wrapoperation
 */

import Operation from './operation';
import UnwrapOperation from './unwrapoperation';
import Position from '../position';
import Range from '../range';
import Element from '../element';
import CKEditorError from '@ckeditor/ckeditor5-utils/src/ckeditorerror';
import { _insert, _move } from './utils';

/**
 * Operation to wrap a range of {@link module:engine/model/item~Item model items} with
 * a {@link module:engine/model/element~Element model element}.
 *
 * @extends module:engine/model/operation/operation~Operation
 */
export default class WrapOperation extends Operation {
	/**
	 * Creates a wrap operation.
	 *
	 * @param {module:engine/model/position~Position} position Position before
	 * the first {@link module:engine/model/item~Item model item} to wrap.
	 * @param {Number} howMany Offset size of wrapped range. Wrapped range will start at `position.offset` and end at
	 * `position.offset + howMany`.
	 * @param {module:engine/model/element~Element} element Element to wrap wit.
	 * @param {Number|null} baseVersion Document {@link module:engine/model/document~Document#version} on which operation
	 * can be applied or `null` if the operation operates on detached (non-document) tree.
	 */
	constructor( position, howMany, element, baseVersion ) {
		super( baseVersion );

		/**
		 * Position before the first {@link module:engine/model/item~Item model item} to wrap.
		 *
		 * @member {module:engine/model/position~Position} module:engine/model/operation/wrapoperation~WrapOperation#position
		 */
		this.position = Position.createFromPosition( position );
		this.position.stickiness = 'toNext';
		// maybe change to a range

		/**
		 * Offset size of wrapped range.
		 *
		 * @member {Number} module:engine/model/operation/wrapoperation~WrapOperation#howMany
		 */
		this.howMany = howMany;

		/**
		 * Element to wrap with.
		 *
		 * @member {module:engine/model/element~Element} module:engine/model/operation/wrapoperation~WrapOperation#element
		 */
		this.element = element;
	}

	/**
	 * @inheritDoc
	 */
	get type() {
		return 'wrap';
	}

	/**
	 * Position to which the wrapped elements will be moved. This is a position at the beginning of the wrapping element.
	 *
	 * @readonly
	 * @type {module:engine/model/position~Position}
	 */
	get targetPosition() {
		const path = this.position.path.slice();
		path.push( 0 );

		return new Position( this.position.root, path );
	}

	/**
	 * A range containing all nodes that will be wrapped.
	 *
	 * @readonly
	 * @type {module:engine/model/range~Range}
	 */
	get wrappedRange() {
		return Range.createFromPositionAndShift( this.position, this.howMany );
	}

	/**
	 * Creates and returns an operation that has the same parameters as this operation.
	 *
	 * @returns {module:engine/model/operation/wrapoperation~WrapOperation} Clone of this operation.
	 */
	clone() {
		return new this.constructor( this.position, this.howMany, this.element._clone(), this.baseVersion );
	}

	/**
	 * See {@link module:engine/model/operation/operation~Operation#getReversed `Operation#getReversed()`}.
	 *
	 * @returns {module:engine/model/operation/unwrapoperation~UnwrapOperation}
	 */
	getReversed() {
		const op = new UnwrapOperation( this.targetPosition, this.howMany, this.baseVersion + 1 );
		op._element = this.element._clone();

		return op;
	}

	/**
	 * @inheritDoc
	 */
	_validate() {
		const element = this.position.parent;
		const offset = this.position.offset;

		// Validate whether wrap operation has correct parameters.
		if ( !element || offset + this.howMany > element.maxOffset ) {
			/**
			 * Wrap range is invalid.
			 *
			 * @error wrap-operation-range-invalid
			 */
			throw new CKEditorError( 'wrap-operation-range-invalid: Wrap range is invalid.' );
		}
	}

	/**
	 * @inheritDoc
	 */
	_execute() {
		const wrappedRange = this.wrappedRange;

		const insertPosition = Position.createFromPosition( wrappedRange.end );
		const element = this.element._clone();

		const targetPath = insertPosition.path.slice();
		targetPath.push( 0 );
		const targetPosition = new Position( this.position.root, targetPath );

		_insert( insertPosition, element );
		_move( wrappedRange, targetPosition );
	}

	/**
	 * @inheritDoc
	 */
	static get className() {
		return 'engine.model.operation.WrapOperation';
	}

	/**
	 * Creates `WrapOperation` object from deserilized object, i.e. from parsed JSON string.
	 *
	 * @param {Object} json Deserialized JSON object.
	 * @param {module:engine/model/document~Document} document Document on which this operation will be applied.
	 * @returns {module:engine/model/operation/wrapoperation~WrapOperation}
	 */
	static fromJSON( json, document ) {
		const position = Position.fromJSON( json.position, document );
		const element = Element.fromJSON( json.element );

		return new this( position, json.howMany, element, json.baseVersion );
	}
}
