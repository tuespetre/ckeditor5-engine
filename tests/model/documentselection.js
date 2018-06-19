/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import Model from '../../src/model/model';
import Batch from '../../src/model/batch';
import Element from '../../src/model/element';
import Text from '../../src/model/text';
import Range from '../../src/model/range';
import Position from '../../src/model/position';
import LiveRange from '../../src/model/liverange';
import DocumentSelection from '../../src/model/documentselection';
import InsertOperation from '../../src/model/operation/insertoperation';
import MoveOperation from '../../src/model/operation/moveoperation';
import RemoveOperation from '../../src/model/operation/removeoperation';
import AttributeOperation from '../../src/model/operation/attributeoperation';
import SplitOperation from '../../src/model/operation/splitoperation';
import SplitDelta from '../../src/model/delta/splitdelta';
import CKEditorError from '@ckeditor/ckeditor5-utils/src/ckeditorerror';
import count from '@ckeditor/ckeditor5-utils/src/count';
import testUtils from '@ckeditor/ckeditor5-core/tests/_utils/utils';
import { wrapInDelta } from '../../tests/model/_utils/utils';
import { setData, getData } from '../../src/dev-utils/model';

testUtils.createSinonSandbox();

describe( 'DocumentSelection', () => {
	let model, doc, root, selection, liveRange, range;

	const fooStoreAttrKey = DocumentSelection._getStoreAttributeKey( 'foo' );
	const abcStoreAttrKey = DocumentSelection._getStoreAttributeKey( 'abc' );

	beforeEach( () => {
		model = new Model();
		doc = model.document;
		root = doc.createRoot();
		root._appendChild( [
			new Element( 'p' ),
			new Element( 'p' ),
			new Element( 'p', [], new Text( 'foobar' ) ),
			new Element( 'p' ),
			new Element( 'p' ),
			new Element( 'p' ),
			new Element( 'p', [], new Text( 'foobar' ) )
		] );
		selection = doc.selection;
		model.schema.register( 'p', { inheritAllFrom: '$block' } );

		model.schema.register( 'widget', {
			isObject: true
		} );

		liveRange = new LiveRange( new Position( root, [ 0 ] ), new Position( root, [ 1 ] ) );
		range = new Range( new Position( root, [ 2 ] ), new Position( root, [ 2, 2 ] ) );
	} );

	afterEach( () => {
		model.destroy();
		liveRange.detach();
	} );

	describe( 'default range', () => {
		it( 'should go to the first editable element', () => {
			const ranges = Array.from( selection.getRanges() );

			expect( ranges.length ).to.equal( 1 );
			expect( selection.anchor.isEqual( new Position( root, [ 0, 0 ] ) ) ).to.be.true;
			expect( selection.focus.isEqual( new Position( root, [ 0, 0 ] ) ) ).to.be.true;
			expect( selection ).to.have.property( 'isBackward', false );
		} );

		it( 'should be set to the beginning of the doc if there is no editable element', () => {
			model = new Model();
			doc = model.document;
			root = doc.createRoot();
			root._insertChild( 0, new Text( 'foobar' ) );
			selection = doc.selection;

			const ranges = Array.from( selection.getRanges() );

			expect( ranges.length ).to.equal( 1 );
			expect( selection.anchor.isEqual( new Position( root, [ 0 ] ) ) ).to.be.true;
			expect( selection.focus.isEqual( new Position( root, [ 0 ] ) ) ).to.be.true;
			expect( selection ).to.have.property( 'isBackward', false );
			expect( count( selection.getAttributes() ) ).to.equal( 0 );
		} );

		it( 'should skip element when you can not put selection', () => {
			model = new Model();
			doc = model.document;
			root = doc.createRoot();
			root._insertChild( 0, [
				new Element( 'img' ),
				new Element( 'p', [], new Text( 'foobar' ) )
			] );
			model.schema.register( 'img' );
			model.schema.register( 'p', { inheritAllFrom: '$block' } );
			selection = doc.selection;

			const ranges = Array.from( selection.getRanges() );

			expect( ranges.length ).to.equal( 1 );
			expect( selection.anchor.isEqual( new Position( root, [ 1, 0 ] ) ) ).to.be.true;
			expect( selection.focus.isEqual( new Position( root, [ 1, 0 ] ) ) ).to.be.true;
			expect( selection ).to.have.property( 'isBackward', false );
			expect( count( selection.getAttributes() ) ).to.equal( 0 );
		} );
	} );

	describe( 'isCollapsed', () => {
		it( 'should be true for the default range (in text position)', () => {
			expect( selection.isCollapsed ).to.be.true;
		} );

		it( 'should be false for the default range (object selection) ', () => {
			root._insertChild( 0, new Element( 'widget' ) );

			expect( selection.isCollapsed ).to.be.false;
		} );

		it( 'should back off to the default algorithm if selection has ranges', () => {
			selection._setTo( range );

			expect( selection.isCollapsed ).to.be.false;
		} );
	} );

	describe( 'anchor', () => {
		it( 'should equal the default range\'s start (in text position)', () => {
			const expectedPos = new Position( root, [ 0, 0 ] );

			expect( selection.anchor.isEqual( expectedPos ) ).to.be.true;
		} );

		it( 'should equal the default range\'s start (object selection)', () => {
			root._insertChild( 0, new Element( 'widget' ) );

			const expectedPos = new Position( root, [ 0 ] );

			expect( selection.anchor.isEqual( expectedPos ) ).to.be.true;
		} );

		it( 'should back off to the default algorithm if selection has ranges', () => {
			selection._setTo( range );

			expect( selection.anchor.isEqual( range.start ) ).to.be.true;
		} );
	} );

	describe( 'focus', () => {
		it( 'should equal the default range\'s end (in text position)', () => {
			const expectedPos = new Position( root, [ 0, 0 ] );

			expect( selection.focus.isEqual( expectedPos ) ).to.be.true;
		} );

		it( 'should equal the default range\'s end (object selection)', () => {
			root._insertChild( 0, new Element( 'widget' ) );

			const expectedPos = new Position( root, [ 1 ] );

			expect( selection.focus.isEqual( expectedPos ) ).to.be.true;
			expect( selection.focus.isEqual( selection.getFirstRange().end ) ).to.be.true;
		} );

		it( 'should back off to the default algorithm if selection has ranges', () => {
			selection._setTo( range );

			expect( selection.focus.isEqual( range.end ) ).to.be.true;
		} );
	} );

	describe( 'rangeCount', () => {
		it( 'should return proper range count', () => {
			expect( selection.rangeCount ).to.equal( 1 );

			selection._setTo( new Range( new Position( root, [ 0 ] ), new Position( root, [ 0 ] ) ) );

			expect( selection.rangeCount ).to.equal( 1 );

			selection._setTo( [
				new Range( new Position( root, [ 2 ] ), new Position( root, [ 2 ] ) ),
				new Range( new Position( root, [ 0 ] ), new Position( root, [ 0 ] ) )
			] );

			expect( selection.rangeCount ).to.equal( 2 );
		} );
	} );

	describe( 'hasOwnRange', () => {
		it( 'should return true if selection has any ranges set', () => {
			selection._setTo( new Range( new Position( root, [ 0 ] ), new Position( root, [ 0 ] ) ) );

			expect( selection.hasOwnRange ).to.be.true;
		} );

		it( 'should return false if selection has a default range', () => {
			expect( selection.hasOwnRange ).to.be.false;
		} );
	} );

	describe( 'destroy()', () => {
		it( 'should unbind all events', () => {
			selection._setTo( [ range, liveRange ] );

			const ranges = Array.from( selection._selection._ranges );

			sinon.spy( ranges[ 0 ], 'detach' );
			sinon.spy( ranges[ 1 ], 'detach' );

			selection.destroy();

			expect( ranges[ 0 ].detach.called ).to.be.true;
			expect( ranges[ 1 ].detach.called ).to.be.true;

			ranges[ 0 ].detach.restore();
			ranges[ 1 ].detach.restore();
		} );
	} );

	describe( 'getFirstRange()', () => {
		it( 'should return default range if no ranges were added', () => {
			const firstRange = selection.getFirstRange();

			expect( firstRange.start.isEqual( new Position( root, [ 0, 0 ] ) ) );
			expect( firstRange.end.isEqual( new Position( root, [ 0, 0 ] ) ) );
		} );
	} );

	describe( 'getLastRange()', () => {
		it( 'should return default range if no ranges were added', () => {
			const lastRange = selection.getLastRange();

			expect( lastRange.start.isEqual( new Position( root, [ 0, 0 ] ) ) );
			expect( lastRange.end.isEqual( new Position( root, [ 0, 0 ] ) ) );
		} );
	} );

	describe( 'getSelectedElement()', () => {
		it( 'should return selected element', () => {
			selection._setTo( liveRange );
			const p = root.getChild( 0 );

			expect( selection.getSelectedElement() ).to.equal( p );
		} );
	} );

	describe( '_setTo() - set collapsed at', () => {
		it( 'detaches all existing ranges', () => {
			selection._setTo( [ range, liveRange ] );

			const spy = testUtils.sinon.spy( LiveRange.prototype, 'detach' );
			selection._setTo( root, 0 );

			expect( spy.calledTwice ).to.be.true;
		} );
	} );

	describe( '_setFocus()', () => {
		it( 'modifies default range', () => {
			const startPos = selection.getFirstPosition();
			const endPos = Position.createAt( root, 'end' );

			selection._setFocus( endPos );

			expect( selection.anchor.compareWith( startPos ) ).to.equal( 'same' );
			expect( selection.focus.compareWith( endPos ) ).to.equal( 'same' );
		} );

		it( 'detaches the range it replaces', () => {
			const startPos = Position.createAt( root, 1 );
			const endPos = Position.createAt( root, 2 );
			const newEndPos = Position.createAt( root, 4 );
			const spy = testUtils.sinon.spy( LiveRange.prototype, 'detach' );

			selection._setTo( new Range( startPos, endPos ) );

			selection._setFocus( newEndPos );

			expect( spy.calledOnce ).to.be.true;
		} );

		it( 'refreshes attributes', () => {
			const spy = sinon.spy( selection._selection, '_updateAttributes' );

			selection._setFocus( Position.createAt( root, 1 ) );

			expect( spy.called ).to.be.true;
		} );
	} );

	describe( '_setTo() - remove all ranges', () => {
		let spy, ranges;

		beforeEach( () => {
			selection._setTo( [ liveRange, range ] );

			spy = sinon.spy();
			selection.on( 'change:range', spy );

			ranges = Array.from( selection._selection._ranges );

			sinon.spy( ranges[ 0 ], 'detach' );
			sinon.spy( ranges[ 1 ], 'detach' );

			selection._setTo( null );
		} );

		afterEach( () => {
			ranges[ 0 ].detach.restore();
			ranges[ 1 ].detach.restore();
		} );

		it( 'should remove all stored ranges (and reset to default range)', () => {
			expect( Array.from( selection.getRanges() ).length ).to.equal( 1 );
			expect( selection.anchor.isEqual( new Position( root, [ 0, 0 ] ) ) ).to.be.true;
			expect( selection.focus.isEqual( new Position( root, [ 0, 0 ] ) ) ).to.be.true;
		} );

		it( 'should detach ranges', () => {
			expect( ranges[ 0 ].detach.called ).to.be.true;
			expect( ranges[ 1 ].detach.called ).to.be.true;
		} );

		it( 'should refresh attributes', () => {
			const spy = sinon.spy( selection._selection, '_updateAttributes' );

			selection._setTo( null );

			expect( spy.called ).to.be.true;
		} );
	} );

	describe( '_setTo()', () => {
		it( 'should throw an error when range is invalid', () => {
			expect( () => {
				selection._setTo( [ { invalid: 'range' } ] );
			} ).to.throw( CKEditorError, /model-selection-added-not-range/ );
		} );

		it( 'should log a warning when trying to set selection to the graveyard', () => {
			// eslint-disable-next-line no-undef
			const warnStub = sinon.stub( console, 'warn' );

			const range = new Range( new Position( model.document.graveyard, [ 0 ] ) );
			selection._setTo( range );

			expect( warnStub.calledOnce ).to.equal( true );
			expect( warnStub.getCall( 0 ).args[ 0 ] ).to.match( /model-selection-range-in-graveyard/ );

			expect( selection._ranges ).to.deep.equal( [] );

			warnStub.restore();
		} );

		it( 'should detach removed ranges', () => {
			selection._setTo( [ liveRange, range ] );

			const oldRanges = Array.from( selection._selection._ranges );

			sinon.spy( oldRanges[ 0 ], 'detach' );
			sinon.spy( oldRanges[ 1 ], 'detach' );

			selection._setTo( [] );

			expect( oldRanges[ 0 ].detach.called ).to.be.true;
			expect( oldRanges[ 1 ].detach.called ).to.be.true;
		} );

		it( 'should refresh attributes', () => {
			const spy = sinon.spy( selection._selection, '_updateAttributes' );

			selection._setTo( [ range ] );

			expect( spy.called ).to.be.true;
		} );

		// See #630.
		it( 'should refresh attributes – integration test for #630', () => {
			model.schema.extend( '$text', { allowIn: '$root' } );

			setData( model, 'f<$text italic="true">[o</$text><$text bold="true">ob]a</$text>r' );

			selection._setTo( [ Range.createFromPositionAndShift( selection.getLastRange().end, 0 ) ] );

			expect( selection.getAttribute( 'bold' ) ).to.equal( true );
			expect( selection.hasAttribute( 'italic' ) ).to.equal( false );

			expect( getData( model ) )
				.to.equal( 'f<$text italic="true">o</$text><$text bold="true">ob[]a</$text>r' );
		} );
	} );

	describe( '_isStoreAttributeKey', () => {
		it( 'should return true if given key is a key of an attribute stored in element by DocumentSelection', () => {
			expect( DocumentSelection._isStoreAttributeKey( fooStoreAttrKey ) ).to.be.true;
		} );

		it( 'should return false if given key is not a key of an attribute stored in element by DocumentSelection', () => {
			expect( DocumentSelection._isStoreAttributeKey( 'foo' ) ).to.be.false;
		} );
	} );

	describe( 'attributes', () => {
		let fullP, emptyP, rangeInFullP, rangeInEmptyP;

		beforeEach( () => {
			root._removeChildren( 0, root.childCount );
			root._appendChild( [
				new Element( 'p', [], new Text( 'foobar' ) ),
				new Element( 'p', [], [] )
			] );

			fullP = root.getChild( 0 );
			emptyP = root.getChild( 1 );

			rangeInFullP = new Range( new Position( root, [ 0, 4 ] ), new Position( root, [ 0, 4 ] ) );
			rangeInEmptyP = new Range( new Position( root, [ 1, 0 ] ), new Position( root, [ 1, 0 ] ) );

			// I've lost 30 mins debugging why my tests fail and that was due to the above code reusing
			// a root which wasn't empty (so the ranges didn't actually make much sense).
			expect( root.childCount ).to.equal( 2 );
		} );

		describe( '_setAttribute()', () => {
			it( 'should set attribute', () => {
				selection._setTo( [ rangeInEmptyP ] );
				selection._setAttribute( 'foo', 'bar' );

				expect( selection.getAttribute( 'foo' ) ).to.equal( 'bar' );
			} );
		} );

		describe( '_removeAttribute()', () => {
			it( 'should remove attribute set on the text fragment', () => {
				selection._setTo( [ rangeInFullP ] );
				selection._setAttribute( 'foo', 'bar' );
				selection._removeAttribute( 'foo' );

				expect( selection.getAttribute( 'foo' ) ).to.be.undefined;
			} );

			it( 'should prevent auto update of the attribute even if attribute is not preset yet', () => {
				selection._setTo( new Position( root, [ 0, 1 ] ) );

				// Remove "foo" attribute that is not present in selection yet.
				expect( selection.hasAttribute( 'foo' ) ).to.be.false;
				selection._removeAttribute( 'foo' );

				// Trigger selecton auto update on document change. It should not get attribute from surrounding text;
				model.change( writer => {
					writer.setAttribute( 'foo', 'bar', Range.createIn( fullP ) );
				} );

				expect( selection.getAttribute( 'foo' ) ).to.be.undefined;
			} );
		} );

		describe( '_getStoredAttributes()', () => {
			it( 'should return no values if there are no ranges in selection', () => {
				const values = Array.from( selection._getStoredAttributes() );

				expect( values ).to.deep.equal( [] );
			} );
		} );

		describe( 'are updated on a direct range change', () => {
			beforeEach( () => {
				root._insertChild( 0, [
					new Element( 'p', { p: true } ),
					new Text( 'a', { a: true } ),
					new Element( 'p', { p: true } ),
					new Text( 'b', { b: true } ),
					new Text( 'c', { c: true } ),
					new Element( 'p', [], [
						new Text( 'd', { d: true } )
					] ),
					new Element( 'p', { p: true } ),
					new Text( 'e', { e: true } )
				] );
			} );

			it( 'if selection is a range, should find first character in it and copy it\'s attributes', () => {
				selection._setTo( [ new Range( new Position( root, [ 2 ] ), new Position( root, [ 5 ] ) ) ] );

				expect( Array.from( selection.getAttributes() ) ).to.deep.equal( [ [ 'b', true ] ] );

				// Step into elements when looking for first character:
				selection._setTo( [ new Range( new Position( root, [ 5 ] ), new Position( root, [ 7 ] ) ) ] );

				expect( Array.from( selection.getAttributes() ) ).to.deep.equal( [ [ 'd', true ] ] );
			} );

			it( 'if selection is collapsed it should seek a character to copy that character\'s attributes', () => {
				// Take styles from character before selection.
				selection._setTo( [ new Range( new Position( root, [ 2 ] ), new Position( root, [ 2 ] ) ) ] );
				expect( Array.from( selection.getAttributes() ) ).to.deep.equal( [ [ 'a', true ] ] );

				// If there are none,
				// Take styles from character after selection.
				selection._setTo( [ new Range( new Position( root, [ 3 ] ), new Position( root, [ 3 ] ) ) ] );
				expect( Array.from( selection.getAttributes() ) ).to.deep.equal( [ [ 'b', true ] ] );

				// If there are none,
				// Look from the selection position to the beginning of node looking for character to take attributes from.
				selection._setTo( [ new Range( new Position( root, [ 6 ] ), new Position( root, [ 6 ] ) ) ] );
				expect( Array.from( selection.getAttributes() ) ).to.deep.equal( [ [ 'c', true ] ] );

				// If there are none,
				// Look from the selection position to the end of node looking for character to take attributes from.
				selection._setTo( [ new Range( new Position( root, [ 0 ] ), new Position( root, [ 0 ] ) ) ] );
				expect( Array.from( selection.getAttributes() ) ).to.deep.equal( [ [ 'a', true ] ] );

				// If there are no characters to copy attributes from, use stored attributes.
				selection._setTo( [ new Range( new Position( root, [ 0, 0 ] ), new Position( root, [ 0, 0 ] ) ) ] );
				expect( Array.from( selection.getAttributes() ) ).to.deep.equal( [] );
			} );

			it( 'should overwrite any previously set attributes', () => {
				selection._setTo( new Position( root, [ 5, 0 ] ) );

				selection._setAttribute( 'x', true );
				selection._setAttribute( 'y', true );

				expect( Array.from( selection.getAttributes() ) ).to.deep.equal( [ [ 'd', true ], [ 'x', true ], [ 'y', true ] ] );

				selection._setTo( new Position( root, [ 1 ] ) );

				expect( Array.from( selection.getAttributes() ) ).to.deep.equal( [ [ 'a', true ] ] );
			} );

			it( 'should fire change:attribute event', () => {
				const spy = sinon.spy();
				selection.on( 'change:attribute', spy );

				selection._setTo( [ new Range( new Position( root, [ 2 ] ), new Position( root, [ 5 ] ) ) ] );

				expect( spy.calledOnce ).to.be.true;
			} );

			it( 'should not fire change:attribute event if attributes did not change', () => {
				selection._setTo( new Position( root, [ 5, 0 ] ) );

				expect( Array.from( selection.getAttributes() ) ).to.deep.equal( [ [ 'd', true ] ] );

				const spy = sinon.spy();
				selection.on( 'change:attribute', spy );

				selection._setTo( new Position( root, [ 5, 1 ] ) );

				expect( Array.from( selection.getAttributes() ) ).to.deep.equal( [ [ 'd', true ] ] );
				expect( spy.called ).to.be.false;
			} );
		} );

		// #986
		describe( 'are not inherited from the inside of object elements', () => {
			beforeEach( () => {
				model.schema.register( 'image', {
					isObject: true
				} );
				model.schema.extend( 'image', { allowIn: '$root' } );
				model.schema.extend( 'image', { allowIn: '$block' } );

				model.schema.register( 'caption' );
				model.schema.extend( 'caption', { allowIn: 'image' } );
				model.schema.extend( '$text', {
					allowIn: [ 'image', 'caption' ],
					allowAttributes: 'bold'
				} );
			} );

			it( 'ignores attributes inside an object if selection contains that object', () => {
				setData( model, '<p>[<image><$text bold="true">Caption for the image.</$text></image>]</p>' );

				expect( selection.hasAttribute( 'bold' ) ).to.equal( false );
			} );

			it( 'ignores attributes inside an object if selection contains that object (deeper structure)', () => {
				setData( model, '<p>[<image><caption><$text bold="true">Caption for the image.</$text></caption></image>]</p>' );

				expect( selection.hasAttribute( 'bold' ) ).to.equal( false );
			} );

			it( 'ignores attributes inside an object if selection contains that object (block level)', () => {
				setData( model, '<p>foo</p>[<image><$text bold="true">Caption for the image.</$text></image>]<p>foo</p>' );

				expect( selection.hasAttribute( 'bold' ) ).to.equal( false );
			} );

			it( 'reads attributes from text even if the selection contains an object', () => {
				setData( model, '<p>x<$text bold="true">[bar</$text><image></image>foo]</p>' );

				expect( selection.getAttribute( 'bold' ) ).to.equal( true );
			} );

			it( 'reads attributes when the entire selection inside an object', () => {
				setData( model, '<p><image><caption><$text bold="true">[bar]</$text></caption></image></p>' );

				expect( selection.getAttribute( 'bold' ) ).to.equal( true );
			} );

			it( 'stops reading attributes if selection starts with an object', () => {
				setData( model, '<p>[<image></image><$text bold="true">bar]</$text></p>' );

				expect( selection.hasAttribute( 'bold' ) ).to.equal( false );
			} );
		} );

		describe( 'parent element\'s attributes', () => {
			it( 'are set using a normal batch', () => {
				const batchTypes = [];

				model.on( 'applyOperation', ( event, args ) => {
					const operation = args[ 0 ];
					const batch = operation.delta.batch;

					batchTypes.push( batch.type );
				} );

				selection._setTo( [ rangeInEmptyP ] );

				model.change( writer => {
					writer.setSelectionAttribute( 'foo', 'bar' );
				} );

				expect( batchTypes ).to.deep.equal( [ 'default' ] );
				expect( emptyP.getAttribute( fooStoreAttrKey ) ).to.equal( 'bar' );
			} );

			it( 'are removed when any content is inserted (reuses the same batch)', () => {
				// Dedupe batches by using a map (multiple change events will be fired).
				const batchTypes = new Map();

				selection._setTo( rangeInEmptyP );
				selection._setAttribute( 'foo', 'bar' );
				selection._setAttribute( 'abc', 'bar' );

				model.on( 'applyOperation', ( event, args ) => {
					const operation = args[ 0 ];
					const batch = operation.delta.batch;

					batchTypes.set( batch, batch.type );
				} );

				model.change( writer => {
					writer.insertText( 'x', rangeInEmptyP.start );
				} );

				expect( emptyP.hasAttribute( fooStoreAttrKey ) ).to.be.false;
				expect( emptyP.hasAttribute( abcStoreAttrKey ) ).to.be.false;

				expect( Array.from( batchTypes.values() ) ).to.deep.equal( [ 'default' ] );
			} );

			it( 'are removed when any content is moved into', () => {
				selection._setTo( rangeInEmptyP );
				selection._setAttribute( 'foo', 'bar' );

				model.change( writer => {
					writer.move( Range.createOn( fullP.getChild( 0 ) ), rangeInEmptyP.start );
				} );

				expect( emptyP.hasAttribute( fooStoreAttrKey ) ).to.be.false;
			} );

			it( 'are removed when containing element is merged with a non-empty element', () => {
				const emptyP2 = new Element( 'p', null, 'x' );
				root._appendChild( emptyP2 );

				emptyP._setAttribute( fooStoreAttrKey, 'bar' );
				emptyP2._setAttribute( fooStoreAttrKey, 'bar' );

				model.change( writer => {
					// <emptyP>{}<emptyP2>
					writer.merge( Position.createAfter( emptyP ) );
				} );

				expect( emptyP.hasAttribute( fooStoreAttrKey ) ).to.be.false;
				expect( emptyP.parent ).to.equal( root ); // Just to be sure we're checking the right element.
			} );

			it( 'are removed even when there is no selection in it', () => {
				emptyP._setAttribute( fooStoreAttrKey, 'bar' );

				selection._setTo( [ rangeInFullP ] );

				model.change( writer => {
					writer.insertText( 'x', rangeInEmptyP.start );
				} );

				expect( emptyP.hasAttribute( fooStoreAttrKey ) ).to.be.false;
			} );

			it( 'are removed only once in case of multi-op deltas', () => {
				let batch;
				const emptyP2 = new Element( 'p', null, 'x' );
				root._appendChild( emptyP2 );

				emptyP._setAttribute( fooStoreAttrKey, 'bar' );
				emptyP2._setAttribute( fooStoreAttrKey, 'bar' );

				model.change( writer => {
					batch = writer.batch;
					// <emptyP>{}<emptyP2>
					writer.merge( Position.createAfter( emptyP ) );
				} );

				expect( emptyP.hasAttribute( fooStoreAttrKey ) ).to.be.false;
				// Attribute delta is only one.
				expect( Array.from( batch.deltas, delta => delta.type ) ).to.deep.equal( [ 'merge', 'attribute' ] );
			} );

			it( 'uses model change to clear attributes', () => {
				selection._setTo( [ rangeInEmptyP ] );

				model.change( writer => {
					writer.setSelectionAttribute( 'foo', 'bar' );
					writer.insertText( 'x', rangeInEmptyP.start );

					// `emptyP` still has the attribute, because attribute clearing is in enqueued block.
					expect( emptyP.hasAttribute( fooStoreAttrKey ) ).to.be.true;
				} );

				// When the dust settles, `emptyP` should not have the attribute.
				expect( emptyP.hasAttribute( fooStoreAttrKey ) ).to.be.false;
			} );

			it( 'are not removed or merged when containing element is merged with another empty element', () => {
				const emptyP2 = new Element( 'p', null );
				root._appendChild( emptyP2 );

				emptyP._setAttribute( fooStoreAttrKey, 'bar' );
				emptyP2._setAttribute( abcStoreAttrKey, 'bar' );

				expect( emptyP.hasAttribute( fooStoreAttrKey ) ).to.be.true;
				expect( emptyP.hasAttribute( abcStoreAttrKey ) ).to.be.false;

				model.change( writer => {
					// <emptyP>{}<emptyP2>
					writer.merge( Position.createAfter( emptyP ) );
				} );

				expect( emptyP.getAttribute( fooStoreAttrKey ) ).to.equal( 'bar' );
				expect( emptyP.parent ).to.equal( root ); // Just to be sure we're checking the right element.
			} );

			// Rename and some other deltas don't specify range in doc#change event.
			// So let's see if there's no crash or something.
			it( 'are not removed on rename', () => {
				model.change( writer => {
					writer.setSelection( rangeInEmptyP );
					writer.setSelectionAttribute( 'foo', 'bar' );
				} );

				sinon.spy( model, 'enqueueChange' );

				model.change( writer => {
					writer.rename( emptyP, 'pnew' );
				} );

				expect( model.enqueueChange.called ).to.be.false;
				expect( emptyP.getAttribute( fooStoreAttrKey ) ).to.equal( 'bar' );
			} );
		} );
	} );

	describe( '_overrideGravity()', () => {
		beforeEach( () => {
			model.schema.extend( '$text', {
				allowIn: '$root'
			} );
		} );

		it( 'should return the UID', () => {
			const overrideUidA = selection._overrideGravity();
			const overrideUidB = selection._overrideGravity();

			expect( overrideUidA ).to.be.a( 'string' );
			expect( overrideUidB ).to.be.a( 'string' );
			expect( overrideUidA ).to.not.equal( overrideUidB );
		} );

		it( 'should mark gravity as overridden', () => {
			expect( selection.isGravityOverridden ).to.false;

			selection._overrideGravity();

			expect( selection.isGravityOverridden ).to.true;
		} );

		it( 'should not inherit attributes from node before the caret', () => {
			setData( model, '<$text bold="true" italic="true">foo[]</$text>' );

			expect( Array.from( selection.getAttributeKeys() ) ).to.have.members( [ 'bold', 'italic' ] );

			selection._overrideGravity();

			expect( Array.from( selection.getAttributeKeys() ) ).to.length( 0 );
		} );

		it( 'should inherit attributes from node after the caret', () => {
			setData( model, '<$text>foo[]</$text><$text bold="true" italic="true">bar</$text>' );

			expect( Array.from( selection.getAttributeKeys() ) ).to.length( 0 );

			selection._overrideGravity();

			expect( Array.from( selection.getAttributeKeys() ) ).to.have.members( [ 'bold', 'italic' ] );
		} );

		it( 'should not retain attributes that are set explicitly', () => {
			setData( model, '<$text italic="true">foo[]</$text>' );

			selection._setAttribute( 'bold', true );

			expect( Array.from( selection.getAttributeKeys() ) ).to.have.members( [ 'bold', 'italic' ] );

			selection._overrideGravity();

			expect( Array.from( selection.getAttributeKeys() ) ).to.have.members( [] );
		} );

		it( 'should retain overridden until selection will not change range by a direct change', () => {
			setData( model, '<$text bold="true" italic="true">foo[]</$text><$text italic="true">bar</$text>' );

			selection._overrideGravity();

			// Changed range but not directly.
			model.change( writer => writer.insertText( 'abc', new Position( root, [ 0 ] ) ) );

			expect( Array.from( selection.getAttributeKeys() ) ).to.have.members( [ 'italic' ] );

			// Changed range directly.
			model.change( writer => writer.setSelection( new Position( root, [ 5 ] ) ) );

			expect( Array.from( selection.getAttributeKeys() ) ).to.have.members( [ 'bold', 'italic' ] );
		} );
	} );

	describe( '_restoreGravity()', () => {
		beforeEach( () => {
			model.schema.extend( '$text', {
				allowIn: '$root'
			} );
		} );

		it( 'should throw when a wrong, already restored, or no UID provided', () => {
			const overrideUid = selection._overrideGravity();
			selection._restoreGravity( overrideUid );

			// Wrong UID
			expect( () => {
				selection._restoreGravity( 'foo' );
			} ).to.throw( CKEditorError, /^document-selection-gravity-wrong-restore/ );

			// Already restored
			expect( () => {
				selection._restoreGravity( overrideUid );
			} ).to.throw( CKEditorError, /^document-selection-gravity-wrong-restore/ );

			// No UID
			expect( () => {
				selection._restoreGravity();
			} ).to.throw( CKEditorError, /^document-selection-gravity-wrong-restore/ );
		} );

		it( 'should revert default gravity when is overridden', () => {
			setData( model, '<$text bold="true" italic="true">foo[]</$text>' );

			const overrideUid = selection._overrideGravity();

			expect( Array.from( selection.getAttributeKeys() ) ).to.length( 0 );
			expect( selection.isGravityOverridden ).to.true;

			selection._restoreGravity( overrideUid );

			expect( Array.from( selection.getAttributeKeys() ) ).to.have.members( [ 'bold', 'italic' ] );
			expect( selection.isGravityOverridden ).to.false;
		} );

		it( 'should be called the same number of times as gravity is overridden to restore it', () => {
			setData( model, '<$text bold="true" italic="true">foo[]</$text>' );

			const overrideUidA = selection._overrideGravity();
			const overrideUidB = selection._overrideGravity();

			expect( selection.isGravityOverridden ).to.true;

			selection._restoreGravity( overrideUidA );

			expect( selection.isGravityOverridden ).to.true;

			selection._restoreGravity( overrideUidB );

			expect( selection.isGravityOverridden ).to.false;
		} );
	} );

	// DocumentSelection uses LiveRanges so here are only simple test to see if integration is
	// working well, without getting into complicated corner cases.
	describe( 'after applying an operation should get updated and fire events', () => {
		let spyRange;

		beforeEach( () => {
			root._removeChildren( 0, root.childCount );
			root._insertChild( 0, [
				new Element( 'p', [], new Text( 'abcdef' ) ),
				new Element( 'p', [], new Text( 'foobar' ) ),
				new Text( 'xyz' )
			] );

			selection._setTo( new Range( new Position( root, [ 0, 2 ] ), new Position( root, [ 1, 4 ] ) ) );

			spyRange = sinon.spy();
			selection.on( 'change:range', spyRange );
		} );

		describe( 'InsertOperation', () => {
			it( 'before selection', () => {
				selection.on( 'change:range', ( evt, data ) => {
					expect( data.directChange ).to.be.false;
				} );

				model.applyOperation( wrapInDelta(
					new InsertOperation(
						new Position( root, [ 0, 1 ] ),
						'xyz',
						doc.version
					)
				) );

				const range = selection.getFirstRange();

				expect( range.start.path ).to.deep.equal( [ 0, 5 ] );
				expect( range.end.path ).to.deep.equal( [ 1, 4 ] );
				expect( spyRange.calledOnce ).to.be.true;
			} );

			it( 'inside selection', () => {
				selection.on( 'change:range', ( evt, data ) => {
					expect( data.directChange ).to.be.false;
				} );

				model.applyOperation( wrapInDelta(
					new InsertOperation(
						new Position( root, [ 1, 0 ] ),
						'xyz',
						doc.version
					)
				) );

				const range = selection.getFirstRange();

				expect( range.start.path ).to.deep.equal( [ 0, 2 ] );
				expect( range.end.path ).to.deep.equal( [ 1, 7 ] );
				expect( spyRange.calledOnce ).to.be.true;
			} );
		} );

		describe( 'MoveOperation', () => {
			it( 'move range from before a selection', () => {
				selection.on( 'change:range', ( evt, data ) => {
					expect( data.directChange ).to.be.false;
				} );

				model.applyOperation( wrapInDelta(
					new MoveOperation(
						new Position( root, [ 0, 0 ] ),
						2,
						new Position( root, [ 2 ] ),
						doc.version
					)
				) );

				const range = selection.getFirstRange();

				expect( range.start.path ).to.deep.equal( [ 0, 0 ] );
				expect( range.end.path ).to.deep.equal( [ 1, 4 ] );
				expect( spyRange.calledOnce ).to.be.true;
			} );

			it( 'moved into before a selection', () => {
				selection.on( 'change:range', ( evt, data ) => {
					expect( data.directChange ).to.be.false;
				} );

				model.applyOperation( wrapInDelta(
					new MoveOperation(
						new Position( root, [ 2 ] ),
						2,
						new Position( root, [ 0, 0 ] ),
						doc.version
					)
				) );

				const range = selection.getFirstRange();

				expect( range.start.path ).to.deep.equal( [ 0, 4 ] );
				expect( range.end.path ).to.deep.equal( [ 1, 4 ] );
				expect( spyRange.calledOnce ).to.be.true;
			} );

			it( 'move range from inside of selection', () => {
				selection.on( 'change:range', ( evt, data ) => {
					expect( data.directChange ).to.be.false;
				} );

				model.applyOperation( wrapInDelta(
					new MoveOperation(
						new Position( root, [ 1, 0 ] ),
						2,
						new Position( root, [ 2 ] ),
						doc.version
					)
				) );

				const range = selection.getFirstRange();

				expect( range.start.path ).to.deep.equal( [ 0, 2 ] );
				expect( range.end.path ).to.deep.equal( [ 1, 2 ] );
				expect( spyRange.calledOnce ).to.be.true;
			} );

			it( 'moved range intersects with selection', () => {
				selection.on( 'change:range', ( evt, data ) => {
					expect( data.directChange ).to.be.false;
				} );

				model.applyOperation( wrapInDelta(
					new MoveOperation(
						new Position( root, [ 1, 3 ] ),
						2,
						new Position( root, [ 4 ] ),
						doc.version
					)
				) );

				const range = selection.getFirstRange();

				expect( range.start.path ).to.deep.equal( [ 0, 2 ] );
				expect( range.end.path ).to.deep.equal( [ 1, 3 ] );
				expect( spyRange.calledOnce ).to.be.true;
			} );

			it( 'split inside selection (do not break selection)', () => {
				selection.on( 'change:range', ( evt, data ) => {
					expect( data.directChange ).to.be.false;
				} );

				const batch = new Batch();
				const splitDelta = new SplitDelta();
				const splitOperation = new SplitOperation( new Position( root, [ 1, 2 ] ), 0 );

				batch.addDelta( splitDelta );
				splitDelta.addOperation( splitOperation );
				model.applyOperation( splitOperation );

				const range = selection.getFirstRange();

				expect( range.start.path ).to.deep.equal( [ 0, 2 ] );
				expect( range.end.path ).to.deep.equal( [ 2, 2 ] );
				expect( spyRange.calledOnce ).to.be.true;
			} );
		} );

		describe( 'AttributeOperation', () => {
			it( 'changed range includes selection anchor', () => {
				const spyAttribute = sinon.spy();
				selection.on( 'change:attribute', spyAttribute );

				selection.on( 'change:attribute', ( evt, data ) => {
					expect( data.directChange ).to.be.false;
					expect( data.attributeKeys ).to.deep.equal( [ 'foo' ] );
				} );

				model.applyOperation( wrapInDelta(
					new AttributeOperation(
						new Range( new Position( root, [ 0, 1 ] ), new Position( root, [ 0, 5 ] ) ),
						'foo',
						null,
						'bar',
						doc.version
					)
				) );

				// Attributes are auto updated on document change.
				model.change( () => {} );

				expect( selection.getAttribute( 'foo' ) ).to.equal( 'bar' );
				expect( spyAttribute.calledOnce ).to.be.true;
			} );

			it( 'should not overwrite previously set attributes', () => {
				selection._setAttribute( 'foo', 'xyz' );

				const spyAttribute = sinon.spy();
				selection.on( 'change:attribute', spyAttribute );

				model.applyOperation( wrapInDelta(
					new AttributeOperation(
						new Range( new Position( root, [ 0, 1 ] ), new Position( root, [ 0, 5 ] ) ),
						'foo',
						null,
						'bar',
						doc.version
					)
				) );

				expect( selection.getAttribute( 'foo' ) ).to.equal( 'xyz' );
				expect( spyAttribute.called ).to.be.false;
			} );

			it( 'should not overwrite previously set attributes with same values', () => {
				selection._setAttribute( 'foo', 'xyz' );

				const spyAttribute = sinon.spy();
				selection.on( 'change:attribute', spyAttribute );

				model.applyOperation( wrapInDelta(
					new AttributeOperation(
						new Range( new Position( root, [ 0, 1 ] ), new Position( root, [ 0, 5 ] ) ),
						'foo',
						null,
						'xyz',
						doc.version
					)
				) );

				expect( selection.getAttribute( 'foo' ) ).to.equal( 'xyz' );
				expect( spyAttribute.called ).to.be.false;
			} );

			it( 'should not overwrite previously removed attributes', () => {
				selection._setAttribute( 'foo', 'xyz' );
				selection._removeAttribute( 'foo' );

				const spyAttribute = sinon.spy();
				selection.on( 'change:attribute', spyAttribute );

				model.applyOperation( wrapInDelta(
					new AttributeOperation(
						new Range( new Position( root, [ 0, 1 ] ), new Position( root, [ 0, 5 ] ) ),
						'foo',
						null,
						'bar',
						doc.version
					)
				) );

				expect( selection.hasAttribute( 'foo' ) ).to.be.false;
				expect( spyAttribute.called ).to.be.false;
			} );
		} );

		describe( 'RemoveOperation', () => {
			it( 'fix selection range if it ends up in graveyard #1', () => {
				selection._setTo( new Position( root, [ 1, 3 ] ) );

				model.applyOperation( wrapInDelta(
					new RemoveOperation(
						new Position( root, [ 1, 2 ] ),
						2,
						new Position( doc.graveyard, [ 0 ] ),
						doc.version
					)
				) );

				expect( selection.getFirstPosition().path ).to.deep.equal( [ 1, 2 ] );
			} );

			it( 'fix selection range if it ends up in graveyard #2', () => {
				selection._setTo( [ new Range( new Position( root, [ 1, 2 ] ), new Position( root, [ 1, 4 ] ) ) ] );

				model.applyOperation( wrapInDelta(
					new RemoveOperation(
						new Position( root, [ 1, 2 ] ),
						2,
						new Position( doc.graveyard, [ 0 ] ),
						doc.version
					)
				) );

				expect( selection.getFirstPosition().path ).to.deep.equal( [ 1, 2 ] );
			} );

			it( 'fix selection range if it ends up in graveyard #3', () => {
				selection._setTo( [ new Range( new Position( root, [ 1, 1 ] ), new Position( root, [ 1, 2 ] ) ) ] );

				model.applyOperation( wrapInDelta(
					new RemoveOperation(
						new Position( root, [ 1 ] ),
						2,
						new Position( doc.graveyard, [ 0 ] ),
						doc.version
					)
				) );

				expect( selection.getFirstPosition().path ).to.deep.equal( [ 0, 6 ] );
			} );

			it( 'fix selection range if it ends up in graveyard #4 - whole content removed', () => {
				model.applyOperation( wrapInDelta(
					new RemoveOperation(
						new Position( root, [ 0 ] ),
						3,
						new Position( doc.graveyard, [ 0 ] ),
						doc.version
					)
				) );

				expect( selection.getFirstPosition().path ).to.deep.equal( [ 0 ] );

				model.applyOperation( wrapInDelta(
					new InsertOperation(
						new Position( root, [ 0 ] ),
						new Element( 'p' ),
						doc.version
					)
				) );

				// Now it's clear that it's the default range.
				expect( selection.getFirstPosition().path ).to.deep.equal( [ 0, 0 ] );
			} );
		} );

		it( '`DocumentSelection#change:range` event should be fire once even if selection contains multi-ranges', () => {
			root._removeChildren( 0, root.childCount );
			root._insertChild( 0, [
				new Element( 'p', [], new Text( 'abcdef' ) ),
				new Element( 'p', [], new Text( 'foobar' ) ),
				new Text( 'xyz #2' )
			] );

			selection._setTo( [
				Range.createIn( root.getNodeByPath( [ 0 ] ) ),
				Range.createIn( root.getNodeByPath( [ 1 ] ) )
			] );

			spyRange = sinon.spy();
			selection.on( 'change:range', spyRange );

			model.applyOperation( wrapInDelta(
				new InsertOperation(
					new Position( root, [ 0 ] ),
					'xyz #1',
					doc.version
				)
			) );

			expect( spyRange.calledOnce ).to.be.true;
		} );
	} );

	it( 'should throw if one of ranges starts or ends inside surrogate pair', () => {
		root._removeChildren( 0, root.childCount );
		root._appendChild( '\uD83D\uDCA9' );

		expect( () => {
			doc.selection._setTo( Range.createFromParentsAndOffsets( root, 0, root, 1 ) );
		} ).to.throw( CKEditorError, /document-selection-wrong-position/ );

		expect( () => {
			doc.selection._setTo( Range.createFromParentsAndOffsets( root, 1, root, 2 ) );
		} ).to.throw( CKEditorError, /document-selection-wrong-position/ );
	} );

	it( 'should throw if one of ranges starts or ends between base character and combining mark', () => {
		root._removeChildren( 0, root.childCount );
		root._appendChild( 'foo̻̐ͩbar' );

		expect( () => {
			doc.selection._setTo( Range.createFromParentsAndOffsets( root, 3, root, 9 ) );
		} ).to.throw( CKEditorError, /document-selection-wrong-position/ );

		expect( () => {
			doc.selection._setTo( Range.createFromParentsAndOffsets( root, 4, root, 9 ) );
		} ).to.throw( CKEditorError, /document-selection-wrong-position/ );

		expect( () => {
			doc.selection._setTo( Range.createFromParentsAndOffsets( root, 5, root, 9 ) );
		} ).to.throw( CKEditorError, /document-selection-wrong-position/ );

		expect( () => {
			doc.selection._setTo( Range.createFromParentsAndOffsets( root, 1, root, 3 ) );
		} ).to.throw( CKEditorError, /document-selection-wrong-position/ );

		expect( () => {
			doc.selection._setTo( Range.createFromParentsAndOffsets( root, 1, root, 4 ) );
		} ).to.throw( CKEditorError, /document-selection-wrong-position/ );

		expect( () => {
			doc.selection._setTo( Range.createFromParentsAndOffsets( root, 1, root, 5 ) );
		} ).to.throw( CKEditorError, /document-selection-wrong-position/ );
	} );
} );
