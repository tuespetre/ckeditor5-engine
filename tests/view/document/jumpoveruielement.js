/**
 * @license Copyright (c) 2003-2017, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/* globals document */

import ViewDocument from '../../../src/view/document';
import UIElement from '../../../src/view/uielement';
import RootEditableElement from '../../../src/view/rooteditableelement';
import ViewContainerElement from '../../../src/view/containerelement';
import ViewAttribtueElement from '../../../src/view/attributeelement';
import ViewText from '../../../src/view/text';
import ViewRange from '../../../src/view/range';
import { keyCodes } from '@ckeditor/ckeditor5-utils/src/keyboard';
import createElement from '@ckeditor/ckeditor5-utils/src/dom/createelement';
import { setData as setViewData } from '../../../src/dev-utils/view';
import testUtils from '@ckeditor/ckeditor5-core/tests/_utils/utils';

describe( 'Document', () => {
	let viewDocument, domRoot, domSelection, viewRoot, foo, bar, ui, ui2;

	class MyUIElement extends UIElement {
		render( domDocument ) {
			const element = super.render( domDocument );
			element.innerText = this.contents;

			return element;
		}
	}

	beforeEach( () => {
		domRoot = createElement( document, 'div', {
			contenteditable: 'true'
		} );
		document.body.appendChild( domRoot );

		viewDocument = new ViewDocument();
		viewRoot = createRoot( 'div', 'main', viewDocument );
		viewDocument.attachDomRoot( domRoot );

		domSelection = document.getSelection();
		domSelection.removeAllRanges();

		viewDocument.isFocused = true;

		foo = new ViewText( 'foo' );
		bar = new ViewText( 'bar' );
		ui = new MyUIElement( 'span' );
		ui.contents = 'xxx';

		ui2 = new MyUIElement( 'span' );
		ui2.contents = 'yyy';
	} );

	afterEach( () => {
		viewDocument.destroy();

		domRoot.parentElement.removeChild( domRoot );
	} );

	function renderAndFireKeydownEvent( options ) {
		viewDocument.render();

		const eventData = Object.assign( { keyCode: keyCodes.arrowright, domTarget: viewDocument.domRoots.get( 'main' ) }, options );
		viewDocument.fire( 'keydown', eventData );
	}

	function check( anchorNode, anchorOffset, focusNode, focusOffset ) {
		const anchor = domSelection.anchorNode.data ? domSelection.anchorNode.data : domSelection.anchorNode.nodeName.toUpperCase();

		expect( anchor, 'anchorNode' ).to.equal( anchorNode );
		expect( domSelection.anchorOffset, 'anchorOffset' ).to.equal( anchorOffset );

		if ( focusNode ) {
			const focus = domSelection.focusNode.data ? domSelection.focusNode.data : domSelection.focusNode.nodeName.toUpperCase();

			expect( focus, 'focusNode' ).to.equal( focusNode );
			expect( domSelection.focusOffset, 'focusOffset' ).to.equal( focusOffset );
		} else {
			expect( domSelection.isCollapsed, 'isCollapsed' ).to.be.true;
		}
	}

	function createRoot( name, rootName, viewDoc ) {
		const viewRoot = new RootEditableElement( name );

		viewRoot.rootName = rootName;
		viewRoot.document = viewDoc;
		viewDoc.roots.add( viewRoot );

		return viewRoot;
	}

	describe( 'jump over ui element handler', () => {
		describe( 'collapsed selection', () => {
			it( 'do nothing when another key is pressed', () => {
				// <container:p>foo<ui:span>xxx</ui:span>{}bar</container:p>
				const p = new ViewContainerElement( 'p', null, [ foo, ui, bar ] );
				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( bar, 0, bar, 0 ) ] );

				renderAndFireKeydownEvent( { keyCode: keyCodes.arrowleft } );

				testUtils.checkAssertions(
					() => check( 'bar', 0 ),
					// Safari renders selection at the end of the text node.
					() => check( 'xxx', 3 )
				);
			} );

			it( 'jump over ui element when right arrow is pressed before ui element - directly before ui element', () => {
				// <container:p>foo[]<ui:span>xxx</ui:span>bar</container:p>
				const p = new ViewContainerElement( 'p', null, [ foo, ui, bar ] );
				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( p, 1, p, 1 ) ] );

				renderAndFireKeydownEvent();

				testUtils.checkAssertions(
					// <p>foo<span>xxx</span>[]bar</p>
					() => check( 'P', 2 ),
					// Safari renders selection at the end of the text node.
					// <p>foo<span>xxx{}</span>bar</p>
					() => check( 'xxx', 3 )
				);
			} );

			it( 'jump over ui element when right arrow is pressed before ui element - not directly before ui element', () => {
				// <container:p>foo{}<ui:span>xxx</ui:span>bar</container:p>
				const p = new ViewContainerElement( 'p', null, [ foo, ui, bar ] );
				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( foo, 3, foo, 3 ) ] );

				renderAndFireKeydownEvent();

				testUtils.checkAssertions(
					// <p>foo<span>xxx</span>[]bar</p>
					() => check( 'P', 2 ),
					// Safari renders selection at the end of the text node.
					// <p>foo<span>xxx{}</span>bar</p>
					() => check( 'xxx', 3 )
				);
			} );

			it( 'jump over multiple ui elements when right arrow is pressed before ui element', () => {
				// <container:p>foo{}<ui:span>xxx</ui:span><ui:span>yyy</ui:span>bar</container:p>'
				const p = new ViewContainerElement( 'p', null, [ foo, ui, ui2, bar ] );
				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( foo, 3, foo, 3 ) ] );

				renderAndFireKeydownEvent();

				testUtils.checkAssertions(
					// <p>foo<span>xxx</span><span>yyy</span>[]bar</p>
					() => check( 'P', 3 ),
					// Safari renders selection at the end of the text node.
					// <p>foo<span>xxx</span><span>yyy{}</span>bar</p>
					() => check( 'yyy', 3 )
				);
			} );

			it( 'jump over ui elements at the end of container element', () => {
				// <container:p>foo{}<ui:span>xxx</ui:span><ui:span>yyy</ui:span></container:p><container:div></container:div>
				const p = new ViewContainerElement( 'p', null, [ foo, ui, ui2 ] );
				const div = new ViewContainerElement( 'div' );
				viewRoot.appendChildren( p );
				viewRoot.appendChildren( div );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( foo, 3, foo, 3 ) ] );

				renderAndFireKeydownEvent();

				testUtils.checkAssertions(
					// <p>foo<span>xxx</span><span>yyy</span>[]</p><div></div>
					() => check( 'P', 3 ),
					// Safari renders selection at the end of the text node.
					// <p>foo<span>xxx</span><span>yyy{}</span></p><div></div>
					() => check( 'yyy', 3 )
				);
			} );

			it( 'jump over ui element if selection is in attribute element - case 1', () => {
				// <container:p><attribute:b>foo{}</attribute:b><ui:span>xxx</ui:span>bar</container:p>
				const b = new ViewAttribtueElement( 'b', null, foo );
				const p = new ViewContainerElement( 'p', null, [ b, ui, bar ] );
				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( foo, 3, foo, 3 ) ] );

				renderAndFireKeydownEvent();

				testUtils.checkAssertions(
					// <p><b>foo</b><span>xxx</span>[]bar</p>
					() => check( 'P', 2 ),
					// Safari renders selection at the end of the text node.
					// <p><b>foo</b><span>xxx{}</span>bar</p>
					() => check( 'xxx', 3 )
				);
			} );

			it( 'jump over ui element if selection is in attribute element - case 2', () => {
				// <container:p><attribute:b>foo[]</attribute:b><ui:span>xxx</ui:span>bar</container:p>
				const b = new ViewAttribtueElement( 'b', null, foo );
				const p = new ViewContainerElement( 'p', null, [ b, ui, bar ] );
				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( b, 1, b, 1 ) ] );

				renderAndFireKeydownEvent();

				testUtils.checkAssertions(
					// <p><b>foo</b><span>xxx</span>[]bar</p>
					() => check( 'P', 2 ),
					// Safari renders selection at the end of the text node.
					// <p><b>foo</b><span>xxx{}</span>bar</p>
					() => check( 'xxx', 3 )
				);
			} );

			it( 'jump over ui element if selection is in multiple attribute elements', () => {
				// <container:p>
				// 		<attribute:i>
				// 			<attribute:b>foo{}</attribute:b>
				// 		</attribute:i>
				// 		<ui:span>
				//			xxx
				// 		</ui:span>
				// 		bar
				// </container:p>
				const b = new ViewAttribtueElement( 'b', null, foo );
				const i = new ViewAttribtueElement( 'i', null, b );
				const p = new ViewContainerElement( 'p', null, [ i, ui, bar ] );

				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( foo, 3, foo, 3 ) ] );

				renderAndFireKeydownEvent();

				testUtils.checkAssertions(
					// <p><i><b>foo</b></i><span>xxx</span>[]bar</p>
					() => check( 'P', 2 ),
					// Safari renders selection at the end of the text node.
					// <p><i><b>foo</b></i><span>xxx{}</span>bar</p>
					() => check( 'xxx', 3 )
				);
			} );

			it( 'jump over empty attribute elements and ui elements', () => {
				// <container:p>' +
				// 		foo{}
				// 		<attribute:b></attribute:b>
				// 		<ui:span>xxx</ui:span>
				// 		<ui:span>yyy</ui:span>
				// 		<attribute:b></attribute:b>
				// 		bar
				// </container:p>
				const b1 = new ViewAttribtueElement( 'b' );
				const b2 = new ViewAttribtueElement( 'b' );
				const p = new ViewContainerElement( 'p', null, [ foo, b1, ui, ui2, b2, bar ] );

				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( foo, 3, foo, 3 ) ] );

				renderAndFireKeydownEvent();

				testUtils.checkAssertions(
					// <p>foo<b></b><span>xxx</span><span>yyy</span>[]bar</p>
					() => check( 'P', 5 ),
					// Safari renders selection at the end of the text node.
					// <p>foo<b></b><span>xxx</span><span>yyy{}</span>bar</p>
					() => check( 'yyy', 3 )
				);
			} );

			it( 'jump over empty attribute elements and ui elements if shift key is pressed', () => {
				// <container:p>
				// 		foo{}
				// 		<attribute:b></attribute:b>
				// 		<ui:span>xxx</ui:span>
				// 		<ui:span>yyy</ui:span>
				// 		<attribute:b></attribute:b>
				// 		bar
				// </container:p>

				const b1 = new ViewAttribtueElement( 'b' );
				const b2 = new ViewAttribtueElement( 'b' );
				const p = new ViewContainerElement( 'p', null, [ foo, b1, ui, ui2, b2, bar ] );

				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( foo, 3, foo, 3 ) ] );

				renderAndFireKeydownEvent( { shiftKey: true } );

				testUtils.checkAssertions(
					// <p>foo<b></b><span>xxx</span><span>yyy</span><b><b>[]bar</p>
					() => check( 'P', 5 ),
					// Safari renders selection at the end of the text node.
					// <p>foo<b></b><span>xxx</span><span>yyy{}</span><b><b>bar</p>
					() => check( 'yyy', 3 )
				);
			} );

			it( 'do nothing if selection is not directly before ui element', () => {
				setViewData( viewDocument, '<container:p>fo{}o<ui:span></ui:span>bar</container:p>' );
				renderAndFireKeydownEvent();

				check( 'foo', 2 );
			} );

			it( 'do nothing if selection is in attribute element but not before ui element', () => {
				setViewData( viewDocument, '<container:p><attribute:b>foo{}</attribute:b>bar</container:p>' );
				renderAndFireKeydownEvent();

				check( 'foo', 3 );
			} );

			it( 'do nothing if selection is before non-empty attribute element', () => {
				setViewData( viewDocument, '<container:p>fo{}<attribute:b>o</attribute:b><ui:span></ui:span>bar</container:p>' );
				renderAndFireKeydownEvent();

				check( 'fo', 2 );
			} );

			it( 'do nothing if selection is before container element - case 1', () => {
				setViewData( viewDocument, '<container:p>foo{}</container:p><ui:span></ui:span><container:div>bar</container:div>' );
				renderAndFireKeydownEvent();

				check( 'foo', 3 );
			} );

			it( 'do nothing if selection is before container element - case 2', () => {
				setViewData( viewDocument, '<container:div>foo{}<container:p></container:p><ui:span></ui:span></container:div>' );
				renderAndFireKeydownEvent();

				check( 'foo', 3 );
			} );

			it( 'do nothing if selection is at the end of last container element', () => {
				setViewData( viewDocument, '<container:p>foo{}</container:p>' );
				renderAndFireKeydownEvent();

				check( 'foo', 3 );
			} );
		} );

		describe( 'non-collapsed selection', () => {
			it( 'should do nothing', () => {
				setViewData( viewDocument, '<container:p>f{oo}<ui:span></ui:span>bar</container:p>' );
				renderAndFireKeydownEvent();

				check( 'foo', 1, 'foo', 3 );
			} );

			it( 'should do nothing if selection is not before ui element - shift key pressed', () => {
				setViewData( viewDocument, '<container:p>f{o}o<ui:span></ui:span>bar</container:p>' );
				renderAndFireKeydownEvent( { shiftKey: true } );

				check( 'foo', 1, 'foo', 2 );
			} );

			it( 'jump over ui element if shift key is pressed', () => {
				// <container:p>fo{o}<ui:span>xxx</ui:span>bar</container:p>
				const p = new ViewContainerElement( 'p', null, [ foo, ui, bar ] );

				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( foo, 2, foo, 3 ) ] );

				renderAndFireKeydownEvent( { shiftKey: true } );

				testUtils.checkAssertions(
					// <p>fo{o<span>xxx</span>]bar</p>
					() => check( 'foo', 2, 'P', 2 ),
					// Safari renders selection at the end of the previous text node.
					// <p>fo{o<span>xxx}</span>bar</p>
					() => check( 'foo', 2, 'xxx', 3 )
				);
			} );

			it( 'jump over ui element if selection is in multiple attribute elements', () => {
				// <container:p>
				// 		<attribute:i>
				// 			<attribute:b>fo{o}</attribute:b>
				// 		</attribute:i>
				// 		<ui:span>xxx</ui:span>
				// 		bar
				// </container:p>
				const b = new ViewAttribtueElement( 'b', null, foo );
				const i = new ViewAttribtueElement( 'i', null, b );
				const p = new ViewContainerElement( 'p', null, [ i, ui, bar ] );
				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( foo, 2, foo, 3 ) ] );

				renderAndFireKeydownEvent( { shiftKey: true } );

				testUtils.checkAssertions(
					// <p><i><b>fo{o</b></i><span>xxx</span>]bar</p>
					() => check( 'foo', 2, 'P', 2 ),
					// Safari renders selection at the end of the previous text node.
					// <p><i><b>fo{o</b></i><span>xxx}</span>bar</p>
					() => check( 'foo', 2, 'xxx', 3 )
				);
			} );

			it( 'jump over empty attribute elements and ui elements if shift key is pressed', () => {
				// <container:p>
				// 		fo{o}
				// 		<attribute:b></attribute:b>
				// 		<ui:span>xxx</ui:span>
				// 		<ui:span>yyy</ui:span>
				// 		<attribute:b></attribute:b>
				// 		bar
				// </container:p>
				const b1 = new ViewAttribtueElement( 'b' );
				const b2 = new ViewAttribtueElement( 'b' );
				const p = new ViewContainerElement( 'p', null, [ foo, b1, ui, ui2, b2, bar ] );
				viewRoot.appendChildren( p );
				viewDocument.selection.setRanges( [ ViewRange.createFromParentsAndOffsets( foo, 2, foo, 3 ) ] );

				renderAndFireKeydownEvent( { shiftKey: true } );

				testUtils.checkAssertions(
					// <p>fo{o<b></b><span>xxx</span><span>yyy</span><b></b>]bar</p>
					() => check( 'foo', 2, 'P', 5 ),
					// Safari renders selection at the end of the previous text node.
					// <p>fo{o<b></b><span>xxx</span><span>yyy}</span><b></b>bar</p>
					() => check( 'foo', 2, 'yyy', 3 )
				);
			} );
		} );

		it( 'should do nothing if dom position cannot be converted to view position', () => {
			const newDiv = document.createElement( 'div' );
			const domSelection = document.getSelection();

			document.body.appendChild( newDiv );
			domSelection.collapse( newDiv, 0 );

			viewDocument.fire( 'keydown', { keyCode: keyCodes.arrowright, domTarget: viewDocument.domRoots.get( 'main' ) } );
		} );
	} );
} );
