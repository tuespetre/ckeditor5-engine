/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/**
 * @module engine/model/documentselection
 */

import mix from '@ckeditor/ckeditor5-utils/src/mix';
import EmitterMixin from '@ckeditor/ckeditor5-utils/src/emittermixin';

import Selection from './selection';
import Position from './position';
import LiveRange from './liverange';
import Text from './text';
import TextProxy from './textproxy';
import toMap from '@ckeditor/ckeditor5-utils/src/tomap';
import CKEditorError from '@ckeditor/ckeditor5-utils/src/ckeditorerror';
import log from '@ckeditor/ckeditor5-utils/src/log';

const attrOpTypes = new Set(
	[ 'addAttribute', 'removeAttribute', 'changeAttribute', 'addRootAttribute', 'removeRootAttribute', 'changeRootAttribute' ]
);

const storePrefix = 'selection:';

/**
 * `DocumentSelection` is a special selection which is used as the
 * {@link module:engine/model/document~Document#selection document's selection}.
 * There can be only one instance of `DocumentSelection` per document.
 *
 * All selection modifiers should be used from the {@link module:engine/model/writer~Writer} instance
 * inside the {@link module:engine/model/model~Model#change} block, as it provides a secure way to modify model.
 *
 * `DocumentSelection` is automatically updated upon changes in the {@link module:engine/model/document~Document document}
 * to always contain valid ranges. Its attributes are inherited from the text unless set explicitly.
 *
 * Differences between {@link module:engine/model/selection~Selection} and `DocumentSelection` are:
 * * there is always a range in `DocumentSelection` - even if no ranges were added there is a "default range"
 * present in the selection,
 * * ranges added to this selection updates automatically when the document changes,
 * * attributes of `DocumentSelection` are updated automatically according to selection ranges.
 *
 * Since `DocumentSelection` uses {@link module:engine/model/liverange~LiveRange live ranges}
 * and is updated when {@link module:engine/model/document~Document document}
 * changes, it cannot be set on {@link module:engine/model/node~Node nodes}
 * that are inside {@link module:engine/model/documentfragment~DocumentFragment document fragment}.
 * If you need to represent a selection in document fragment,
 * use {@link module:engine/model/selection~Selection Selection class} instead.
 */
export default class DocumentSelection {
	/**
	 * Creates an empty live selection for given {@link module:engine/model/document~Document}.
	 *
	 * @param {module:engine/model/document~Document} doc Document which owns this selection.
	 */
	constructor( doc ) {
		/**
		 * Selection used internally by that class (`DocumentSelection` is a proxy to that selection).
		 *
		 * @protected
		 */
		this._selection = new LiveSelection( doc );

		this._selection.delegate( 'change:range' ).to( this );
		this._selection.delegate( 'change:attribute' ).to( this );
	}

	/**
	 * Returns whether the selection is collapsed. Selection is collapsed when there is exactly one range which is
	 * collapsed.
	 *
	 * @readonly
	 * @type {Boolean}
	 */
	get isCollapsed() {
		return this._selection.isCollapsed;
	}

	/**
	 * Selection anchor. Anchor may be described as a position where the most recent part of the selection starts.
	 * Together with {@link #focus} they define the direction of selection, which is important
	 * when expanding/shrinking selection. Anchor is always {@link module:engine/model/range~Range#start start} or
	 * {@link module:engine/model/range~Range#end end} position of the most recently added range.
	 *
	 * Is set to `null` if there are no ranges in selection.
	 *
	 * @see #focus
	 * @readonly
	 * @type {module:engine/model/position~Position|null}
	 */
	get anchor() {
		return this._selection.anchor;
	}

	/**
	 * Selection focus. Focus is a position where the selection ends.
	 *
	 * Is set to `null` if there are no ranges in selection.
	 *
	 * @see #anchor
	 * @readonly
	 * @type {module:engine/model/position~Position|null}
	 */
	get focus() {
		return this._selection.focus;
	}

	/**
	 * Returns number of ranges in selection.
	 *
	 * @readonly
	 * @type {Number}
	 */
	get rangeCount() {
		return this._selection.rangeCount;
	}

	/**
	 * Describes whether `Documentselection` has own range(s) set, or if it is defaulted to
	 * {@link module:engine/model/document~Document#_getDefaultRange document's default range}.
	 *
	 * @readonly
	 * @type {Boolean}
	 */
	get hasOwnRange() {
		return this._selection.hasOwnRange;
	}

	/**
	 * Specifies whether the {@link #focus}
	 * precedes {@link #anchor}.
	 *
	 * @readonly
	 * @type {Boolean}
	 */
	get isBackward() {
		return this._selection.isBackward;
	}

	/**
	 * Used for the compatibility with the {@link module:engine/model/selection~Selection#isEqual} method.
	 *
	 * @protected
	 */
	get _ranges() {
		return this._selection._ranges;
	}

	/**
	 * Returns an iterable that iterates over copies of selection ranges.
	 *
	 * @returns {Iterable.<module:engine/model/range~Range>}
	 */
	getRanges() {
		return this._selection.getRanges();
	}

	/**
	 * Returns the first position in the selection.
	 * First position is the position that {@link module:engine/model/position~Position#isBefore is before}
	 * any other position in the selection.
	 *
	 * Returns `null` if there are no ranges in selection.
	 *
	 * @returns {module:engine/model/position~Position|null}
	 */
	getFirstPosition() {
		return this._selection.getFirstPosition();
	}

	/**
	 * Returns the last position in the selection.
	 * Last position is the position that {@link module:engine/model/position~Position#isAfter is after}
	 * any other position in the selection.
	 *
	 * Returns `null` if there are no ranges in selection.
	 *
	 * @returns {module:engine/model/position~Position|null}
	 */
	getLastPosition() {
		return this._selection.getLastPosition();
	}

	/**
	 * Returns a copy of the first range in the selection.
	 * First range is the one which {@link module:engine/model/range~Range#start start} position
	 * {@link module:engine/model/position~Position#isBefore is before} start position of all other ranges
	 * (not to confuse with the first range added to the selection).
	 *
	 * Returns `null` if there are no ranges in selection.
	 *
	 * @returns {module:engine/model/range~Range|null}
	 */
	getFirstRange() {
		return this._selection.getFirstRange();
	}

	/**
	 * Returns a copy of the last range in the selection.
	 * Last range is the one which {@link module:engine/model/range~Range#end end} position
	 * {@link module:engine/model/position~Position#isAfter is after} end position of all other ranges (not to confuse with the range most
	 * recently added to the selection).
	 *
	 * Returns `null` if there are no ranges in selection.
	 *
	 * @returns {module:engine/model/range~Range|null}
	 */
	getLastRange() {
		return this._selection.getLastRange();
	}

	/**
	 * Gets elements of type "block" touched by the selection.
	 *
	 * This method's result can be used for example to apply block styling to all blocks covered by this selection.
	 *
	 * **Note:** `getSelectedBlocks()` always returns the deepest block.
	 *
	 * In this case the function will return exactly all 3 paragraphs:
	 *
	 *		<paragraph>[a</paragraph>
	 *		<quote>
	 *			<paragraph>b</paragraph>
	 *		</quote>
	 *		<paragraph>c]d</paragraph>
	 *
	 * In this case the paragraph will also be returned, despite the collapsed selection:
	 *
	 *		<paragraph>[]a</paragraph>
	 *
	 * **Special case**: If a selection ends at the beginning of a block, that block is not returned as from user perspective
	 * this block wasn't selected. See [#984](https://github.com/ckeditor/ckeditor5-engine/issues/984) for more details.
	 *
	 *		<paragraph>[a</paragraph>
	 *		<paragraph>b</paragraph>
	 *		<paragraph>]c</paragraph> // this block will not be returned
	 *
	 * @returns {Iterator.<module:engine/model/element~Element>}
	 */
	getSelectedBlocks() {
		return this._selection.getSelectedBlocks();
	}

	/**
	 * Returns the selected element. {@link module:engine/model/element~Element Element} is considered as selected if there is only
	 * one range in the selection, and that range contains exactly one element.
	 * Returns `null` if there is no selected element.
	 *
	 * @returns {module:engine/model/element~Element|null}
	 */
	getSelectedElement() {
		return this._selection.getSelectedElement();
	}

	/**
	 * Checks whether the selection contains the entire content of the given element. This means that selection must start
	 * at a position {@link module:engine/model/position~Position#isTouching touching} the element's start and ends at position
	 * touching the element's end.
	 *
	 * By default, this method will check whether the entire content of the selection's current root is selected.
	 * Useful to check if e.g. the user has just pressed <kbd>Ctrl</kbd> + <kbd>A</kbd>.
	 *
	 * @param {module:engine/model/element~Element} [element=this.anchor.root]
	 * @returns {Boolean}
	 */
	containsEntireContent( element ) {
		return this._selection.containsEntireContent( element );
	}

	/**
	 * Unbinds all events previously bound by document selection.
	 */
	destroy() {
		this._selection.destroy();
	}

	/**
	 * Returns iterable that iterates over this selection's attribute keys.
	 *
	 * @returns {Iterable.<String>}
	 */
	getAttributeKeys() {
		return this._selection.getAttributeKeys();
	}

	/**
	 * Returns iterable that iterates over this selection's attributes.
	 *
	 * Attributes are returned as arrays containing two items. First one is attribute key and second is attribute value.
	 * This format is accepted by native `Map` object and also can be passed in `Node` constructor.
	 *
	 * @returns {Iterable.<*>}
	 */
	getAttributes() {
		return this._selection.getAttributes();
	}

	/**
	 * Gets an attribute value for given key or `undefined` if that attribute is not set on the selection.
	 *
	 * @param {String} key Key of attribute to look for.
	 * @returns {*} Attribute value or `undefined`.
	 */
	getAttribute( key ) {
		return this._selection.getAttribute( key );
	}

	/**
	 * Checks if the selection has an attribute for given key.
	 *
	 * @param {String} key Key of attribute to check.
	 * @returns {Boolean} `true` if attribute with given key is set on selection, `false` otherwise.
	 */
	hasAttribute( key ) {
		return this._selection.hasAttribute( key );
	}

	/**
	 * Moves {@link module:engine/model/documentselection~DocumentSelection#focus} to the specified location.
	 * Should be used only within the {@link module:engine/model/writer~Writer#setSelectionFocus} method.
	 *
	 * The location can be specified in the same form as {@link module:engine/model/position~Position.createAt} parameters.
	 *
	 * @see module:engine/model/writer~Writer#setSelectionFocus
	 * @protected
	 * @param {module:engine/model/item~Item|module:engine/model/position~Position} itemOrPosition
	 * @param {Number|'end'|'before'|'after'} [offset] Offset or one of the flags. Used only when
	 * first parameter is a {@link module:engine/model/item~Item model item}.
	 */
	_setFocus( itemOrPosition, offset ) {
		this._selection.setFocus( itemOrPosition, offset );
	}

	/**
	 * Sets this selection's ranges and direction to the specified location based on the given
	 * {@link module:engine/model/selection~Selection selection}, {@link module:engine/model/position~Position position},
	 * {@link module:engine/model/element~Element element}, {@link module:engine/model/position~Position position},
	 * {@link module:engine/model/range~Range range}, an iterable of {@link module:engine/model/range~Range ranges} or null.
	 * Should be used only within the {@link module:engine/model/writer~Writer#setSelection} method.
	 *
	 * @see module:engine/model/writer~Writer#setSelection
	 * @protected
	 * @param {module:engine/model/selection~Selection|module:engine/model/documentselection~DocumentSelection|
	 * module:engine/model/position~Position|module:engine/model/element~Element|
	 * Iterable.<module:engine/model/range~Range>|module:engine/model/range~Range|null} selectable
	 * @param {Boolean|Number|'before'|'end'|'after'} [backwardSelectionOrOffset]
	 */
	_setTo( selectable, backwardSelectionOrOffset ) {
		this._selection.setTo( selectable, backwardSelectionOrOffset );
	}

	/**
	 * Sets attribute on the selection. If attribute with the same key already is set, it's value is overwritten.
	 * Should be used only within the {@link module:engine/model/writer~Writer#setSelectionAttribute} method.
	 *
	 * @see module:engine/model/writer~Writer#setSelectionAttribute
	 * @protected
	 * @param {String} key Key of the attribute to set.
	 * @param {*} value Attribute value.
	 */
	_setAttribute( key, value ) {
		this._selection.setAttribute( key, value );
	}

	/**
	 * Removes an attribute with given key from the selection.
	 * If the given attribute was set on the selection, fires the {@link module:engine/model/selection~Selection#event:change}
	 * event with removed attribute key.
	 * Should be used only within the {@link module:engine/model/writer~Writer#removeSelectionAttribute} method.
	 *
	 * @see module:engine/model/writer~Writer#removeSelectionAttribute
	 * @protected
	 * @param {String} key Key of the attribute to remove.
	 */
	_removeAttribute( key ) {
		this._selection.removeAttribute( key );
	}

	/**
	 * Returns an iterable that iterates through all selection attributes stored in current selection's parent.
	 *
	 * @protected
	 * @returns {Iterable.<*>}
	 */
	_getStoredAttributes() {
		return this._selection._getStoredAttributes();
	}

	/**
	 * Generates and returns an attribute key for selection attributes store, basing on original attribute key.
	 *
	 * @protected
	 * @param {String} key Attribute key to convert.
	 * @returns {String} Converted attribute key, applicable for selection store.
	 */
	static _getStoreAttributeKey( key ) {
		return storePrefix + key;
	}

	/**
	 * Checks whether the given attribute key is an attribute stored on an element.
	 *
	 * @protected
	 * @param {String} key
	 * @returns {Boolean}
	 */
	static _isStoreAttributeKey( key ) {
		return key.startsWith( storePrefix );
	}
}

mix( DocumentSelection, EmitterMixin );

// `LiveSelection` is used internally by {@link module:engine/model/documentselection~DocumentSelection} and shouldn't be used directly.
//
// LiveSelection` is automatically updated upon changes in the {@link module:engine/model/document~Document document}
// to always contain valid ranges. Its attributes are inherited from the text unless set explicitly.
//
// Differences between {@link module:engine/model/selection~Selection} and `LiveSelection` are:
// * there is always a range in `LiveSelection` - even if no ranges were added there is a "default range"
// present in the selection,
// * ranges added to this selection updates automatically when the document changes,
// * attributes of `LiveSelection` are updated automatically according to selection ranges.
//
// @extends module:engine/model/selection~Selection
//

class LiveSelection extends Selection {
	// Creates an empty live selection for given {@link module:engine/model/document~Document}.
	// @param {module:engine/model/document~Document} doc Document which owns this selection.
	constructor( doc ) {
		super();

		// Document which owns this selection.
		//
		// @protected
		// @member {module:engine/model/model~Model}
		this._model = doc.model;

		// Document which owns this selection.
		//
		// @protected
		// @member {module:engine/model/document~Document}
		this._document = doc;

		// Keeps mapping of attribute name to priority with which the attribute got modified (added/changed/removed)
		// last time. Possible values of priority are: `'low'` and `'normal'`.
		//
		// Priorities are used by internal `LiveSelection` mechanisms. All attributes set using `LiveSelection`
		// attributes API are set with `'normal'` priority.
		//
		// @private
		// @member {Map} module:engine/model/liveselection~LiveSelection#_attributePriority
		this._attributePriority = new Map();

		// Contains data required to fix ranges which have been moved to the graveyard.
		// @private
		// @member {Array} module:engine/model/liveselection~LiveSelection#_fixGraveyardRangesData
		this._fixGraveyardRangesData = [];

		// Flag that informs whether the selection ranges have changed. It is changed on true when `LiveRange#change:range` event is fired.
		// @private
		// @member {Array} module:engine/model/liveselection~LiveSelection#_hasChangedRange
		this._hasChangedRange = false;

		// Add events that will ensure selection correctness.
		this.on( 'change:range', () => {
			for ( const range of this.getRanges() ) {
				if ( !this._document._validateSelectionRange( range ) ) {
					/**
					 * Range from {@link module:engine/model/documentselection~DocumentSelection document selection}
					 * starts or ends at incorrect position.
					 *
					 * @error document-selection-wrong-position
					 * @param {module:engine/model/range~Range} range
					 */
					throw new CKEditorError(
						'document-selection-wrong-position: Range from document selection starts or ends at incorrect position.',
						{ range }
					);
				}
			}
		} );

		this.listenTo( this._model, 'applyOperation', ( evt, args ) => {
			const operation = args[ 0 ];

			if ( !operation.isDocumentOperation ) {
				return;
			}

			// Whenever attribute operation is performed on document, update selection attributes.
			// This is not the most efficient way to update selection attributes, but should be okay for now.
			if ( attrOpTypes.has( operation.type ) ) {
				this._updateAttributes( false );
			}

			const batch = operation.delta.batch;

			// Batch may not be passed to the document#change event in some tests.
			// See https://github.com/ckeditor/ckeditor5-engine/issues/1001#issuecomment-314202352
			if ( batch ) {
				// Whenever element which had selection's attributes stored in it stops being empty,
				// the attributes need to be removed.
				clearAttributesStoredInElement( operation, this._model, batch );
			}
		}, { priority: 'low' } );

		this.listenTo( this._model, 'applyOperation', () => {
			while ( this._fixGraveyardRangesData.length ) {
				const { liveRange, sourcePosition } = this._fixGraveyardRangesData.shift();

				this._fixGraveyardSelection( liveRange, sourcePosition );
			}

			if ( this._hasChangedRange ) {
				this._hasChangedRange = false;

				this.fire( 'change:range', { directChange: false } );
			}
		}, { priority: 'lowest' } );
	}

	get isCollapsed() {
		const length = this._ranges.length;

		return length === 0 ? this._document._getDefaultRange().isCollapsed : super.isCollapsed;
	}

	get anchor() {
		return super.anchor || this._document._getDefaultRange().start;
	}

	get focus() {
		return super.focus || this._document._getDefaultRange().end;
	}

	get rangeCount() {
		return this._ranges.length ? this._ranges.length : 1;
	}

	// Describes whether `LiveSelection` has own range(s) set, or if it is defaulted to
	// {@link module:engine/model/document~Document#_getDefaultRange document's default range}.
	//
	// @readonly
	// @type {Boolean}
	get hasOwnRange() {
		return this._ranges.length > 0;
	}

	// Unbinds all events previously bound by live selection.
	destroy() {
		for ( let i = 0; i < this._ranges.length; i++ ) {
			this._ranges[ i ].detach();
		}

		this.stopListening();
	}

	* getRanges() {
		if ( this._ranges.length ) {
			yield* super.getRanges();
		} else {
			yield this._document._getDefaultRange();
		}
	}

	getFirstRange() {
		return super.getFirstRange() || this._document._getDefaultRange();
	}

	getLastRange() {
		return super.getLastRange() || this._document._getDefaultRange();
	}

	setTo( selectable, backwardSelectionOrOffset ) {
		super.setTo( selectable, backwardSelectionOrOffset );
		this._refreshAttributes();
	}

	setFocus( itemOrPosition, offset ) {
		super.setFocus( itemOrPosition, offset );
		this._refreshAttributes();
	}

	setAttribute( key, value ) {
		if ( this._setAttribute( key, value ) ) {
			// Fire event with exact data.
			const attributeKeys = [ key ];
			this.fire( 'change:attribute', { attributeKeys, directChange: true } );
		}
	}

	removeAttribute( key ) {
		if ( this._removeAttribute( key ) ) {
			// Fire event with exact data.
			const attributeKeys = [ key ];
			this.fire( 'change:attribute', { attributeKeys, directChange: true } );
		}
	}

	// Removes all attributes from the selection and sets attributes according to the surrounding nodes.
	_refreshAttributes() {
		this._updateAttributes( true );
	}

	_popRange() {
		this._ranges.pop().detach();
	}

	_pushRange( range ) {
		const liveRange = this._prepareRange( range );

		// `undefined` is returned when given `range` is in graveyard root.
		if ( liveRange ) {
			this._ranges.push( liveRange );
		}
	}

	// Prepares given range to be added to selection. Checks if it is correct,
	// converts it to {@link module:engine/model/liverange~LiveRange LiveRange}
	// and sets listeners listening to the range's change event.
	//
	// @private
	// @param {module:engine/model/range~Range} range
	_prepareRange( range ) {
		this._checkRange( range );

		if ( range.root == this._document.graveyard ) {
			/**
			 * Trying to add a Range that is in the graveyard root. Range rejected.
			 *
			 * @warning model-selection-range-in-graveyard
			 */
			log.warn( 'model-selection-range-in-graveyard: Trying to add a Range that is in the graveyard root. Range rejected.' );

			return;
		}

		const liveRange = LiveRange.createFromRange( range );

		liveRange.on( 'change:range', ( evt, oldRange, data ) => {
			this._hasChangedRange = true;

			// If `LiveRange` is in whole moved to the graveyard, save necessary data. It will be fixed on `Model#applyOperation` event.
			if ( liveRange.root == this._document.graveyard ) {
				this._fixGraveyardRangesData.push( {
					liveRange,
					sourcePosition: data.sourcePosition
				} );
			}
		} );

		return liveRange;
	}

	// Updates this selection attributes according to its ranges and the {@link module:engine/model/document~Document model document}.
	//
	// @protected
	// @param {Boolean} clearAll
	// @fires change:attribute
	_updateAttributes( clearAll ) {
		const newAttributes = toMap( this._getSurroundingAttributes() );
		const oldAttributes = toMap( this.getAttributes() );

		if ( clearAll ) {
			// If `clearAll` remove all attributes and reset priorities.
			this._attributePriority = new Map();
			this._attrs = new Map();
		} else {
			// If not, remove only attributes added with `low` priority.
			for ( const [ key, priority ] of this._attributePriority ) {
				if ( priority == 'low' ) {
					this._attrs.delete( key );
					this._attributePriority.delete( key );
				}
			}
		}

		this._setAttributesTo( newAttributes );

		// Let's evaluate which attributes really changed.
		const changed = [];

		// First, loop through all attributes that are set on selection right now.
		// Check which of them are different than old attributes.
		for ( const [ newKey, newValue ] of this.getAttributes() ) {
			if ( !oldAttributes.has( newKey ) || oldAttributes.get( newKey ) !== newValue ) {
				changed.push( newKey );
			}
		}

		// Then, check which of old attributes got removed.
		for ( const [ oldKey ] of oldAttributes ) {
			if ( !this.hasAttribute( oldKey ) ) {
				changed.push( oldKey );
			}
		}

		// Fire event with exact data (fire only if anything changed).
		if ( changed.length > 0 ) {
			this.fire( 'change:attribute', { attributeKeys: changed, directChange: false } );
		}
	}

	// Internal method for setting `LiveSelection` attribute. Supports attribute priorities (through `directChange`
	// parameter).
	//
	// @private
	// @param {String} key Attribute key.
	// @param {*} value Attribute value.
	// @param {Boolean} [directChange=true] `true` if the change is caused by `Selection` API, `false` if change
	// is caused by `Batch` API.
	// @returns {Boolean} Whether value has changed.
	_setAttribute( key, value, directChange = true ) {
		const priority = directChange ? 'normal' : 'low';

		if ( priority == 'low' && this._attributePriority.get( key ) == 'normal' ) {
			// Priority too low.
			return false;
		}

		const oldValue = super.getAttribute( key );

		// Don't do anything if value has not changed.
		if ( oldValue === value ) {
			return false;
		}

		this._attrs.set( key, value );

		// Update priorities map.
		this._attributePriority.set( key, priority );

		return true;
	}

	// Internal method for removing `LiveSelection` attribute. Supports attribute priorities (through `directChange`
	// parameter).
	//
	// @private
	// @param {String} key Attribute key.
	// @param {Boolean} [directChange=true] `true` if the change is caused by `Selection` API, `false` if change
	// is caused by `Batch` API.
	// @returns {Boolean} Whether attribute was removed. May not be true if such attributes didn't exist or the
	// existing attribute had higher priority.
	_removeAttribute( key, directChange = true ) {
		const priority = directChange ? 'normal' : 'low';

		if ( priority == 'low' && this._attributePriority.get( key ) == 'normal' ) {
			// Priority too low.
			return false;
		}

		// Don't do anything if value has not changed.
		if ( !super.hasAttribute( key ) ) {
			return false;
		}

		this._attrs.delete( key );

		// Update priorities map.
		this._attributePriority.set( key, priority );

		return true;
	}

	// Internal method for setting multiple `LiveSelection` attributes. Supports attribute priorities (through
	// `directChange` parameter).
	//
	// @private
	// @param {Map.<String,*>} attrs Iterable object containing attributes to be set.
	// @returns {Set.<String>} Changed attribute keys.
	_setAttributesTo( attrs ) {
		const changed = new Set();

		for ( const [ oldKey, oldValue ] of this.getAttributes() ) {
			// Do not remove attribute if attribute with same key and value is about to be set.
			if ( attrs.get( oldKey ) === oldValue ) {
				continue;
			}

			// All rest attributes will be removed so changed attributes won't change .
			this._removeAttribute( oldKey, false );
		}

		for ( const [ key, value ] of attrs ) {
			// Attribute may not be set because of attributes or because same key/value is already added.
			const gotAdded = this._setAttribute( key, value, false );

			if ( gotAdded ) {
				changed.add( key );
			}
		}

		return changed;
	}

	// Returns an iterable that iterates through all selection attributes stored in current selection's parent.
	//
	// @protected
	// @returns {Iterable.<*>}
	* _getStoredAttributes() {
		const selectionParent = this.getFirstPosition().parent;

		if ( this.isCollapsed && selectionParent.isEmpty ) {
			for ( const key of selectionParent.getAttributeKeys() ) {
				if ( key.startsWith( storePrefix ) ) {
					const realKey = key.substr( storePrefix.length );

					yield [ realKey, selectionParent.getAttribute( key ) ];
				}
			}
		}
	}

	// Checks model text nodes that are closest to the selection's first position and returns attributes of first
	// found element. If there are no text nodes in selection's first position parent, it returns selection
	// attributes stored in that parent.
	//
	// @private
	// @returns {Iterable.<*>} Collection of attributes.
	_getSurroundingAttributes() {
		const position = this.getFirstPosition();
		const schema = this._model.schema;

		let attrs = null;

		if ( !this.isCollapsed ) {
			// 1. If selection is a range...
			const range = this.getFirstRange();

			// ...look for a first character node in that range and take attributes from it.
			for ( const value of range ) {
				// If the item is an object, we don't want to get attributes from its children.
				if ( value.item.is( 'element' ) && schema.isObject( value.item ) ) {
					break;
				}

				// This is not an optimal solution because of https://github.com/ckeditor/ckeditor5-engine/issues/454.
				// It can be done better by using `break;` instead of checking `attrs === null`.
				if ( value.type == 'text' && attrs === null ) {
					attrs = value.item.getAttributes();
				}
			}
		} else {
			// 2. If the selection is a caret or the range does not contain a character node...

			const nodeBefore = position.textNode ? position.textNode : position.nodeBefore;
			const nodeAfter = position.textNode ? position.textNode : position.nodeAfter;

			// ...look at the node before caret and take attributes from it if it is a character node.
			attrs = getAttrsIfCharacter( nodeBefore );

			// 3. If not, look at the node after caret...
			if ( !attrs ) {
				attrs = getAttrsIfCharacter( nodeAfter );
			}

			// 4. If not, try to find the first character on the left, that is in the same node.
			if ( !attrs ) {
				let node = nodeBefore;

				while ( node && !attrs ) {
					node = node.previousSibling;
					attrs = getAttrsIfCharacter( node );
				}
			}

			// 5. If not found, try to find the first character on the right, that is in the same node.
			if ( !attrs ) {
				let node = nodeAfter;

				while ( node && !attrs ) {
					node = node.nextSibling;
					attrs = getAttrsIfCharacter( node );
				}
			}

			// 6. If not found, selection should retrieve attributes from parent.
			if ( !attrs ) {
				attrs = this._getStoredAttributes();
			}
		}

		return attrs;
	}

	// Fixes a selection range after it ends up in graveyard root.
	//
	// @private
	// @param {module:engine/model/liverange~LiveRange} liveRange The range from selection, that ended up in the graveyard root.
	// @param {module:engine/model/position~Position} removedRangeStart Start position of a range which was removed.
	_fixGraveyardSelection( liveRange, removedRangeStart ) {
		// The start of the removed range is the closest position to the `liveRange` - the original selection range.
		// This is a good candidate for a fixed selection range.
		const positionCandidate = Position.createFromPosition( removedRangeStart );

		// Find a range that is a correct selection range and is closest to the start of removed range.
		const selectionRange = this._model.schema.getNearestSelectionRange( positionCandidate );

		// Remove the old selection range before preparing and adding new selection range. This order is important,
		// because new range, in some cases, may intersect with old range (it depends on `getNearestSelectionRange()` result).
		const index = this._ranges.indexOf( liveRange );
		this._ranges.splice( index, 1 );
		liveRange.detach();

		// If nearest valid selection range has been found - add it in the place of old range.
		if ( selectionRange ) {
			// Check the range, convert it to live range, bind events, etc.
			const newRange = this._prepareRange( selectionRange );

			// Add new range in the place of old range.
			this._ranges.splice( index, 0, newRange );
		}
		// If nearest valid selection range cannot be found - just removing the old range is fine.
	}
}

// Helper function for {@link module:engine/model/liveselection~LiveSelection#_updateAttributes}.
//
// It takes model item, checks whether it is a text node (or text proxy) and, if so, returns it's attributes. If not, returns `null`.
//
// @param {module:engine/model/item~Item|null}  node
// @returns {Boolean}
function getAttrsIfCharacter( node ) {
	if ( node instanceof TextProxy || node instanceof Text ) {
		return node.getAttributes();
	}

	return null;
}

// Removes selection attributes from element which is not empty anymore.
function clearAttributesStoredInElement( operation, model, batch ) {
	let changeParent = null;

	if ( operation.type == 'insert' ) {
		changeParent = operation.position.parent;
	} else if ( operation.type == 'move' || operation.type == 'reinsert' || operation.type == 'remove' ) {
		changeParent = operation.getMovedRangeStart().parent;
	}

	if ( !changeParent || changeParent.isEmpty ) {
		return;
	}

	model.enqueueChange( batch, writer => {
		const storedAttributes = Array.from( changeParent.getAttributeKeys() ).filter( key => key.startsWith( storePrefix ) );

		for ( const key of storedAttributes ) {
			writer.removeAttribute( key, changeParent );
		}
	} );
}
