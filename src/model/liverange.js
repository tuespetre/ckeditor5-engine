/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/**
 * @module engine/model/liverange
 */

import Range from './range';
import EmitterMixin from '@ckeditor/ckeditor5-utils/src/emittermixin';
import mix from '@ckeditor/ckeditor5-utils/src/mix';

/**
 * `LiveRange` is a type of {@link module:engine/model/range~Range Range}
 * that updates itself as {@link module:engine/model/document~Document document}
 * is changed through operations. It may be used as a bookmark.
 *
 * **Note:** Be very careful when dealing with `LiveRange`. Each `LiveRange` instance bind events that might
 * have to be unbound. Use {@link module:engine/model/liverange~LiveRange#detach detach} whenever you don't need `LiveRange` anymore.
 */
export default class LiveRange extends Range {
	/**
	 * Creates a live range.
	 *
	 * @see module:engine/model/range~Range
	 */
	constructor( start, end ) {
		super( start, end );

		bindWithDocument.call( this );
	}

	/**
	 * Unbinds all events previously bound by `LiveRange`. Use it whenever you don't need `LiveRange` instance
	 * anymore (i.e. when leaving scope in which it was declared or before re-assigning variable that was
	 * referring to it).
	 */
	detach() {
		this.stopListening();
	}

	/**
	 * @see module:engine/model/range~Range.createIn
	 * @static
	 * @method module:engine/model/liverange~LiveRange.createIn
	 * @param {module:engine/model/element~Element} element
	 * @returns {module:engine/model/liverange~LiveRange}
	 */

	/**
	 * @see module:engine/model/range~Range.createFromPositionAndShift
	 * @static
	 * @method module:engine/model/liverange~LiveRange.createFromPositionAndShift
	 * @param {module:engine/model/position~Position} position
	 * @param {Number} shift
	 * @returns {module:engine/model/liverange~LiveRange}
	 */

	/**
	 * @see module:engine/model/range~Range.createFromParentsAndOffsets
	 * @static
	 * @method module:engine/model/liverange~LiveRange.createFromParentsAndOffsets
	 * @param {module:engine/model/element~Element} startElement
	 * @param {Number} startOffset
	 * @param {module:engine/model/element~Element} endElement
	 * @param {Number} endOffset
	 * @returns {module:engine/model/liverange~LiveRange}
	 */

	/**
	 * @see module:engine/model/range~Range.createFromRange
	 * @static
	 * @method module:engine/model/liverange~LiveRange.createFromRange
	 * @param {module:engine/model/range~Range} range
	 * @returns {module:engine/model/liverange~LiveRange}
	 */

	/**
	 * Fired when `LiveRange` instance boundaries have changed due to changes in the
	 * {@link module:engine/model/document~Document document}.
	 *
	 * @event change:range
	 * @param {module:engine/model/range~Range} oldRange Range with start and end position equal to start and end position of this live
	 * range before it got changed.
	 * @param {Object} data Object with additional information about the change. Those parameters are passed from
	 * {@link module:engine/model/document~Document#event:change document change event}.
	 * @param {String} data.type Change type.
	 * @param {module:engine/model/batch~Batch} data.batch Batch which changed the live range.
	 * @param {module:engine/model/range~Range} data.range Range containing the result of applied change.
	 * @param {module:engine/model/position~Position} data.sourcePosition Source position for move, remove and reinsert change types.
	 */

	/**
	 * Fired when `LiveRange` instance boundaries have not changed after a change in {@link module:engine/model/document~Document document}
	 * but the change took place inside the range, effectively changing its content.
	 *
	 * @event change:content
	 * @param {module:engine/model/range~Range} range Range with start and end position equal to start and end position of
	 * change range.
	 * @param {Object} data Object with additional information about the change. Those parameters are passed from
	 * {@link module:engine/model/document~Document#event:change document change event}.
	 * @param {String} data.type Change type.
	 * @param {module:engine/model/batch~Batch} data.batch Batch which changed the live range.
	 * @param {module:engine/model/range~Range} data.range Range containing the result of applied change.
	 * @param {module:engine/model/position~Position} data.sourcePosition Source position for move, remove and reinsert change types.
	 */
}

/**
 * Binds this `LiveRange` to the {@link module:engine/model/document~Document document}
 * that owns this range's {@link module:engine/model/range~Range#root root}.
 *
 * @ignore
 * @private
 * @method module:engine/model/liverange~LiveRange#bindWithDocument
 */
function bindWithDocument() {
	// Operation types that a range can be transformed by.
	const supportedTypes = new Set( [ 'insert', 'move', 'remove', 'reinsert' ] );

	this.listenTo(
		this.root.document.model,
		'applyOperation',
		( event, args ) => {
			const operation = args[ 0 ];

			if ( !operation.isDocumentOperation ) {
				return;
			}

			if ( supportedTypes.has( operation.type ) ) {
				transform.call( this, operation );
			}
		},
		{ priority: 'low' }
	);
}

/**
 * Updates this range accordingly to the updates applied to the model. Bases on change events.
 *
 * @ignore
 * @private
 * @method transform
 * @param {module:engine/model/operation/operation~Operation} operation Executed operation.
 */
function transform( operation ) {
	const result = Range.createFromRanges( this.getTransformedByDelta( operation.delta ) );
	const boundariesChanged = !result.isEqual( this );
	const contentChanged = doesOperationChangeRangeContent( this, operation );

	if ( boundariesChanged ) {
		// If range boundaries have changed, fire `change:range` event.
		const oldRange = Range.createFromRange( this );

		this.start = result.start;
		this.end = result.end;

		this.fire( 'change:range', oldRange, operation );
	} else if ( contentChanged ) {
		// If range boundaries have not changed, but there was change inside the range, fire `change:content` event.
		this.fire( 'change:content', Range.createFromRange( this ), operation );
	}
}

function doesOperationChangeRangeContent( range, operation ) {
	switch ( operation.type ) {
		case 'insert':
		case 'split':
		case 'wrap':
		case 'unwrap':
			return range.containsPosition( operation.position );
		case 'move':
		case 'remove':
		case 'reinsert':
		case 'merge':
			return range.containsPosition( operation.sourcePosition ) || range.containsPosition( operation.targetPosition );
	}

	return false;
}

mix( LiveRange, EmitterMixin );