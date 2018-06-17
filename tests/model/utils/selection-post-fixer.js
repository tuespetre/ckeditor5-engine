/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import Model from '../../../src/model/model';
import ModelPosition from '../../../src/model/position';
import ModelRange from '../../../src/model/range';

import { injectSelectionPostFixer } from '../../../src/model/utils/selection-post-fixer';

import { getData as getModelData, setData as setModelData } from '../../../src/dev-utils/model';

describe( 'Selection post-fixer', () => {
	describe( 'injectSelectionPostFixer()', () => {
		it( 'is a function', () => {
			expect( injectSelectionPostFixer ).to.be.a( 'function' );
		} );
	} );

	describe( 'injected behavior', () => {
		let model, modelRoot;

		beforeEach( () => {
			model = new Model();
			modelRoot = model.document.createRoot();

			model.schema.register( 'paragraph', { inheritAllFrom: '$block' } );

			model.schema.register( 'table', {
				allowWhere: '$block',
				isObject: true,
				isLimit: true
			} );

			model.schema.register( 'tableRow', {
				allowIn: 'table',
				isLimit: true
			} );

			model.schema.register( 'tableCell', {
				allowIn: 'tableRow',
				allowContentOf: '$block',
				isLimit: true
			} );

			model.schema.register( 'image', {
				allowIn: '$root',
				isObject: true
			} );

			model.schema.register( 'caption', {
				allowIn: 'image',
				allowContentOf: '$block',
				isLimit: true
			} );
		} );

		it( 'should not crash if there is no correct position for model selection', () => {
			setModelData( model, '' );

			expect( getModelData( model ) ).to.equal( '[]' );
		} );

		it( 'should react to structure changes', () => {
			setModelData( model, '<paragraph>[]foo</paragraph><image></image>' );

			model.change( writer => {
				writer.remove( modelRoot.getChild( 0 ) );
			} );

			expect( getModelData( model ) ).to.equal( '[<image></image>]' );
		} );

		it( 'should react to selection changes', () => {
			setModelData( model, '<paragraph>[]foo</paragraph><image></image>' );

			// <paragraph>foo</paragraph>[]<image></image>
			model.change( writer => {
				writer.setSelection(
					ModelRange.createFromParentsAndOffsets( modelRoot, 1, modelRoot, 1 )
				);
			} );

			expect( getModelData( model ) ).to.equal( '<paragraph>foo[]</paragraph><image></image>' );
		} );

		describe( 'non-collapsed selection - table scenarios', () => {
			beforeEach( () => {
				setModelData( model,
					'<paragraph>[]foo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix #1', () => {
				// <paragraph>f[oo</paragraph><table><tableRow><tableCell></tableCell>]<tableCell>...
				model.change( writer => {
					writer.setSelection( ModelRange.createFromParentsAndOffsets(
						modelRoot.getChild( 0 ), 1,
						modelRoot.getChild( 1 ).getChild( 0 ), 1
					) );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>f[oo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>]' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix #2', () => {
				// ...<table><tableRow><tableCell></tableCell>[<tableCell></tableCell></tableRow></table><paragraph>b]ar</paragraph>
				model.change( writer => {
					writer.setSelection( ModelRange.createFromParentsAndOffsets(
						modelRoot.getChild( 1 ).getChild( 0 ), 1,
						modelRoot.getChild( 2 ), 1
					) );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'[<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>b]ar</paragraph>'
				);
			} );

			it( 'should fix #3', () => {
				// <paragraph>f[oo</paragraph><table>]<tableRow>...
				model.change( writer => {
					writer.setSelection( ModelRange.createFromParentsAndOffsets(
						modelRoot.getChild( 0 ), 1,
						modelRoot.getChild( 1 ), 0
					) );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>f[oo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>]' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix #4', () => {
				// <paragraph>foo</paragraph><table><tableRow><tableCell>a[aa</tableCell><tableCell>b]bb</tableCell>
				model.change( writer => {
					writer.setSelection( ModelRange.createFromParentsAndOffsets(
						modelRoot.getChild( 1 ).getChild( 0 ).getChild( 0 ), 1,
						modelRoot.getChild( 1 ).getChild( 0 ).getChild( 1 ), 2
					) );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'[<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>]' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix #5', () => {
				setModelData( model,
					'<paragraph>foo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'[]' +
					'<table>' +
						'<tableRow><tableCell>xxx</tableCell><tableCell>yyy</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>baz</paragraph>'
				);

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'[<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>]' +
					'<table>' +
						'<tableRow><tableCell>xxx</tableCell><tableCell>yyy</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>baz</paragraph>'
				);
			} );

			// There's a chance that this and the following test will not be up to date with
			// how the table feature is really implemented once we'll introduce row/cells/columns selection
			// in which case all these elements will need to be marked as objects.
			it( 'should fix #6 (element selection of not an object)', () => {
				setModelData( model,
					'<paragraph>foo</paragraph>' +
					'<table>' +
						'[<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>]' +
					'</table>' +
					'<paragraph>baz</paragraph>'
				);

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'[<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>]' +
					'<paragraph>baz</paragraph>'
				);
			} );

			it( 'should fix #7 (element selection of non-objects)', () => {
				setModelData( model,
					'<paragraph>foo</paragraph>' +
					'<table>' +
						'[<tableRow><tableCell>1</tableCell><tableCell>2</tableCell></tableRow>' +
						'<tableRow><tableCell>3</tableCell><tableCell>4</tableCell>]</tableRow>' +
						'<tableRow><tableCell>5</tableCell><tableCell>6</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>baz</paragraph>'
				);

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'[<table>' +
						'<tableRow><tableCell>1</tableCell><tableCell>2</tableCell></tableRow>' +
						'<tableRow><tableCell>3</tableCell><tableCell>4</tableCell></tableRow>' +
						'<tableRow><tableCell>5</tableCell><tableCell>6</tableCell></tableRow>' +
					'</table>]' +
					'<paragraph>baz</paragraph>'
				);
			} );

			it( 'should fix #8 (cross-limit selection which starts in a non-limit elements)', () => {
				model.schema.extend( 'paragraph', { allowIn: 'tableCell' } );

				setModelData( model,
					'<paragraph>foo</paragraph>' +
					'<table>' +
						'<tableRow>' +
							'<tableCell><paragraph>f[oo</paragraph></tableCell>' +
							'<tableCell><paragraph>b]ar</paragraph></tableCell>' +
						'</tableRow>' +
					'</table>' +
					'<paragraph>baz</paragraph>'
				);

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'[<table>' +
						'<tableRow>' +
							'<tableCell><paragraph>foo</paragraph></tableCell>' +
							'<tableCell><paragraph>bar</paragraph></tableCell>' +
						'</tableRow>' +
					'</table>]' +
					'<paragraph>baz</paragraph>'
				);
			} );

			it( 'should not fix #1', () => {
				setModelData( model,
					'<paragraph>foo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>b[ar</paragraph>' +
					'<paragraph>ba]z</paragraph>'
				);

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>b[ar</paragraph>' +
					'<paragraph>ba]z</paragraph>'
				);
			} );

			it( 'should fix multiple ranges #1', () => {
				model.change( writer => {
					const ranges = [
						new ModelRange( new ModelPosition( modelRoot, [ 0, 1 ] ), new ModelPosition( modelRoot, [ 1, 0 ] ) ),
						new ModelRange( new ModelPosition( modelRoot, [ 1, 0, 0, 0 ] ), new ModelPosition( modelRoot, [ 1, 1 ] ) )
					];
					writer.setSelection( ranges );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>f[oo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>]' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix multiple ranges #2', () => {
				model.change( writer => {
					const ranges = [
						new ModelRange( new ModelPosition( modelRoot, [ 0, 1 ] ), new ModelPosition( modelRoot, [ 1, 0 ] ) ),
						new ModelRange( new ModelPosition( modelRoot, [ 1, 0, 0, 0 ] ), new ModelPosition( modelRoot, [ 2, 2 ] ) )
					];

					writer.setSelection( ranges );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>f[oo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>ba]r</paragraph>'
				);
			} );

			it( 'should fix multiple ranges #3', () => {
				setModelData( model,
					'<paragraph>foo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>[aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
						'<tableRow>]<tableCell>[aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
						'<tableRow>]<tableCell>[aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
						'<tableRow>]<tableCell>[aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>b]az</paragraph>'
				);

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'[<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>b]az</paragraph>'
				);
			} );

			it( 'should fix multiple ranges #4', () => {
				model.change( writer => {
					const ranges = [
						new ModelRange( new ModelPosition( modelRoot, [ 0, 1 ] ), new ModelPosition( modelRoot, [ 1, 0 ] ) ),
						new ModelRange( new ModelPosition( modelRoot, [ 1, 0, 0, 0 ] ), new ModelPosition( modelRoot, [ 2, 1 ] ) ),
						new ModelRange( new ModelPosition( modelRoot, [ 2, 2 ] ), new ModelPosition( modelRoot, [ 2, 3 ] ) )
					];

					writer.setSelection( ranges );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>f[oo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>b]a[r]</paragraph>'
				);
			} );
		} );

		describe( 'non-collapsed selection - image scenarios', () => {
			beforeEach( () => {
				setModelData( model,
					'<paragraph>[]foo</paragraph>' +
					'<image>' +
						'<caption>xxx</caption>' +
					'</image>' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix #1 (crossing object and limit boundaries)', () => {
				model.change( writer => {
					// <paragraph>f[oo</paragraph><image><caption>x]xx</caption>...
					writer.setSelection( ModelRange.createFromParentsAndOffsets(
						modelRoot.getChild( 0 ), 1,
						modelRoot.getChild( 1 ).getChild( 0 ), 1
					) );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>f[oo</paragraph>' +
					'<image>' +
						'<caption>xxx</caption>' +
					'</image>]' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix #2 (crossing object boundary)', () => {
				model.change( writer => {
					// <paragraph>f[oo</paragraph><image>]<caption>xxx</caption>...
					writer.setSelection( ModelRange.createFromParentsAndOffsets(
						modelRoot.getChild( 0 ), 1,
						modelRoot.getChild( 1 ), 0
					) );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>f[oo</paragraph>' +
					'<image>' +
						'<caption>xxx</caption>' +
					'</image>]' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix #3 (crossing object boundary)', () => {
				model.change( writer => {
					// <paragraph>f[oo</paragraph><image><caption>xxx</caption>]</image>...
					writer.setSelection( ModelRange.createFromParentsAndOffsets(
						modelRoot.getChild( 0 ), 1,
						modelRoot.getChild( 1 ), 1
					) );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>f[oo</paragraph>' +
					'<image>' +
						'<caption>xxx</caption>' +
					'</image>]' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix #4 (element selection of not an object)', () => {
				model.change( writer => {
					// <paragraph>foo</paragraph><image>[<caption>xxx</caption>]</image>...
					writer.setSelection( ModelRange.createFromParentsAndOffsets(
						modelRoot.getChild( 1 ), 0,
						modelRoot.getChild( 1 ), 1
					) );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'[<image>' +
						'<caption>xxx</caption>' +
					'</image>]' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should not fix #1 (element selection of an object)', () => {
				model.change( writer => {
					// <paragraph>foo</paragraph>[<image><caption>xxx</caption></image>]...
					writer.setSelection( ModelRange.createFromParentsAndOffsets(
						modelRoot, 1,
						modelRoot, 2
					) );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'[<image>' +
						'<caption>xxx</caption>' +
					'</image>]' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should not fix #2 (inside a limit)', () => {
				model.change( writer => {
					const caption = modelRoot.getChild( 1 ).getChild( 0 );

					// <paragraph>foo</paragraph><image><caption>[xxx]</caption></image>...
					writer.setSelection( ModelRange.createFromParentsAndOffsets(
						caption, 0,
						caption, 3
					) );
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'<image>' +
						'<caption>[xxx]</caption>' +
					'</image>' +
					'<paragraph>bar</paragraph>'
				);
			} );
		} );

		describe( 'non-collapsed selection - other scenarios', () => {
			it( 'should fix #1 (element selection of not an object)', () => {
				setModelData( model,
					'<paragraph>aaa</paragraph>' +
					'[<paragraph>bbb</paragraph>]' +
					'<paragraph>ccc</paragraph>'
				);

				expect( getModelData( model ) ).to.equal(
					'<paragraph>aaa</paragraph>' +
					'<paragraph>[bbb]</paragraph>' +
					'<paragraph>ccc</paragraph>'
				);
			} );

			it( 'should fix #2 (elements selection of not an object)', () => {
				setModelData( model,
					'<paragraph>aaa</paragraph>' +
					'[<paragraph>bbb</paragraph>' +
					'<paragraph>ccc</paragraph>]'
				);

				expect( getModelData( model ) ).to.equal(
					'<paragraph>aaa</paragraph>' +
					'<paragraph>[bbb</paragraph>' +
					'<paragraph>ccc]</paragraph>'
				);
			} );

			it( 'should fix #3 (selection must not cross a limit element; starts in a non-limit)', () => {
				model.schema.register( 'a', { isLimit: true, allowIn: '$root' } );
				model.schema.register( 'b', { isLimit: true, allowIn: 'a' } );
				model.schema.register( 'c', { allowIn: 'b' } );
				model.schema.extend( '$text', { allowIn: 'c' } );

				setModelData( model,
					'<a><b><c>[</c></b></a>]'
				);

				expect( getModelData( model ) ).to.equal( '[<a><b><c></c></b></a>]' );
			} );
		} );

		describe( 'collapsed selection', () => {
			beforeEach( () => {
				setModelData( model,
					'<paragraph>[]foo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix #1', () => {
				// <table>[]<tableRow>...
				model.change( writer => {
					writer.setSelection(
						ModelRange.createFromParentsAndOffsets( modelRoot.getChild( 1 ), 0, modelRoot.getChild( 1 ), 0 )
					);
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo[]</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix #2', () => {
				// <table><tableRow>[]<tableCell>...
				model.change( writer => {
					const row = modelRoot.getChild( 1 ).getChild( 0 );

					writer.setSelection(
						ModelRange.createFromParentsAndOffsets( row, 0, row, 0 )
					);
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>foo</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>[]aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>bar</paragraph>'
				);
			} );

			it( 'should fix multiple ranges #1', () => {
				// []<paragraph></paragraph>[]<table>...
				model.change( writer => {
					writer.setSelection(
						[
							ModelRange.createFromParentsAndOffsets( modelRoot, 0, modelRoot, 0 ),
							ModelRange.createFromParentsAndOffsets( modelRoot, 1, modelRoot, 1 )
						]
					);
				} );

				expect( getModelData( model ) ).to.equal(
					'<paragraph>[]foo[]</paragraph>' +
					'<table>' +
						'<tableRow><tableCell>aaa</tableCell><tableCell>bbb</tableCell></tableRow>' +
					'</table>' +
					'<paragraph>bar</paragraph>'
				);
			} );
		} );
	} );
} );
